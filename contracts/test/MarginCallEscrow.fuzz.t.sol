// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MarginCallEscrow} from "../src/MarginCallEscrow.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";

/// @notice Fuzz payout, rake, entry order, and timeout bounds for hardened escrow (#206/#207).
contract MarginCallEscrowFuzzTest is Test {
    MarginCallEscrow public escrow;
    MockERC20 public usdc;
    MockIdentityRegistry public registry;

    address settlementOp = address(0xBEEF);
    address depositorBinder = address(0xB1DE);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    uint256 constant TRADER_A = 1;
    uint256 constant TRADER_B = 2;
    uint256 constant ENTRY_TIMEOUT = 3600;

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        registry = new MockIdentityRegistry();
        escrow = new MarginCallEscrow(
            address(usdc),
            address(registry),
            settlementOp,
            depositorBinder,
            ENTRY_TIMEOUT
        );

        registry.setOwner(TRADER_A, alice);
        registry.setOwner(TRADER_B, bob);

        vm.prank(depositorBinder);
        escrow.setDepositor(TRADER_A, alice);
        vm.prank(depositorBinder);
        escrow.setDepositor(TRADER_B, bob);

        usdc.mint(alice, 100_000_000e6);
        usdc.mint(bob, 100_000_000e6);
        vm.prank(alice);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function testFuzz_settleEntry_respectsExtractionAndRakeBounds(
        uint96 potRaw,
        uint96 entryRaw,
        uint96 grossRaw,
        uint96 rakeRaw
    ) public {
        uint256 potAmount = bound(uint256(potRaw), 4, 1_000_000e6);
        uint256 entryCost = bound(uint256(entryRaw), 1, potAmount);
        // Ensure pot survives 5% fee with nonzero extraction cap.
        vm.assume((potAmount - (potAmount * 5) / 100) * 2500 >= 10_000);

        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Fuzz settle", potAmount, entryCost);

        MarginCallEscrow.Deal memory deal = escrow.getDeal(dealId);
        vm.prank(bob);
        escrow.depositFor(TRADER_B, entryCost);
        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);

        deal = escrow.getDeal(dealId);
        uint256 available = deal.potAmount - deal.reservedAmount + entryCost;
        uint256 maxGross =
            _min(deal.potAmount, _min(available, entryCost + deal.maxExtractionAmount));

        uint256 gross = bound(uint256(grossRaw), 0, maxGross);
        uint256 profit = gross > entryCost ? gross - entryCost : 0;
        uint256 rake = bound(uint256(rakeRaw), 0, profit);

        uint256 bobBefore = escrow.getBalance(TRADER_B);
        uint256 feesBefore = escrow.platformFees();

        vm.prank(settlementOp);
        escrow.settleEntry(dealId, TRADER_B, gross, rake);

        deal = escrow.getDeal(dealId);
        assertEq(deal.pendingEntries, 0);
        assertEq(deal.reservedAmount, 0);
        if (gross > 0) {
            assertEq(escrow.getBalance(TRADER_B), bobBefore + gross - rake);
            assertEq(escrow.platformFees(), feesBefore + rake);
        } else {
            assertEq(escrow.getBalance(TRADER_B), bobBefore);
            assertEq(escrow.platformFees(), feesBefore);
        }
    }

    function testFuzz_settleEntry_revertsWhenGrossExceedsAvailable(
        uint96 potRaw,
        uint96 entryRaw,
        uint96 excessRaw
    ) public {
        uint256 potAmount = bound(uint256(potRaw), 100e6, 1_000_000e6);
        uint256 entryCost = bound(uint256(entryRaw), 1e6, potAmount / 10);
        vm.assume((potAmount - (potAmount * 5) / 100) * 2500 >= 10_000);

        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Fuzz excess", potAmount, entryCost);

        // Two pending entries so available < pot for the second settlement.
        vm.prank(bob);
        escrow.depositFor(TRADER_B, entryCost);
        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);

        uint256 tidC = 3;
        address carol = address(0xCA201);
        registry.setOwner(tidC, carol);
        vm.prank(depositorBinder);
        escrow.setDepositor(tidC, carol);
        usdc.mint(carol, 10_000_000e6);
        vm.prank(carol);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(carol);
        escrow.depositFor(tidC, entryCost);
        vm.prank(settlementOp);
        escrow.enterDeal(dealId, tidC);

        MarginCallEscrow.Deal memory deal = escrow.getDeal(dealId);
        uint256 available = deal.potAmount - deal.reservedAmount + entryCost;
        uint256 excess =
            bound(uint256(excessRaw), available + 1, available + deal.maxExtractionAmount + entryCost + 1);
        // Cap to something that might also trip extraction/pot checks; prefer available.
        if (excess > deal.potAmount) excess = deal.potAmount;
        vm.assume(excess > available);

        vm.prank(settlementOp);
        vm.expectRevert();
        escrow.settleEntry(dealId, TRADER_B, excess, 0);
    }

    function testFuzz_outOfOrderSettlement(uint8 outcomeA, uint8 outcomeB) public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Order fuzz", 10_000e6, 100e6);

        uint256 tidC = 3;
        address carol = address(0xCA201);
        registry.setOwner(tidC, carol);
        vm.prank(depositorBinder);
        escrow.setDepositor(tidC, carol);
        usdc.mint(carol, 1_000_000e6);
        vm.prank(carol);
        usdc.approve(address(escrow), type(uint256).max);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 100e6);
        vm.prank(carol);
        escrow.depositFor(tidC, 100e6);
        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);
        vm.prank(settlementOp);
        escrow.enterDeal(dealId, tidC);

        // 0 = break-even, 1 = partial loss, 2 = max win (clamped)
        uint256 grossB = _outcomeGross(outcomeA % 3, 100e6, 2375e6);
        uint256 grossC = _outcomeGross(outcomeB % 3, 100e6, 2375e6);

        // Compute clamps before vm.prank — argument evaluation (view calls)
        // would otherwise consume the prank and settle as address(this).
        if ((outcomeA % 2) == 0) {
            uint256 first = _clampForSecond(dealId, TRADER_B, grossB);
            vm.prank(settlementOp);
            escrow.settleEntry(dealId, TRADER_B, first, 0);
            uint256 second = _clampForSecond(dealId, tidC, grossC);
            vm.prank(settlementOp);
            escrow.settleEntry(dealId, tidC, second, 0);
        } else {
            uint256 first = _clampForSecond(dealId, tidC, grossC);
            vm.prank(settlementOp);
            escrow.settleEntry(dealId, tidC, first, 0);
            uint256 second = _clampForSecond(dealId, TRADER_B, grossB);
            vm.prank(settlementOp);
            escrow.settleEntry(dealId, TRADER_B, second, 0);
        }

        assertEq(escrow.getDeal(dealId).pendingEntries, 0);
        assertEq(escrow.getDeal(dealId).reservedAmount, 0);
    }

    function testFuzz_refundAfterTimeout(uint32 warpExtra) public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Timeout fuzz", 1000e6, 100e6);
        vm.prank(bob);
        escrow.depositFor(TRADER_B, 100e6);
        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);

        uint256 extra = bound(uint256(warpExtra), 0, 30 days);
        vm.warp(block.timestamp + ENTRY_TIMEOUT + extra);

        uint256 before = escrow.getBalance(TRADER_B);
        escrow.refundExpiredEntry(dealId, TRADER_B);
        assertEq(escrow.getBalance(TRADER_B), before + 100e6);
        assertFalse(escrow.hasPendingEntry(dealId, TRADER_B));
    }

    function _outcomeGross(uint256 kind, uint256 entryCost, uint256 maxProfit)
        internal
        pure
        returns (uint256)
    {
        if (kind == 0) return entryCost;
        if (kind == 1) return entryCost / 2;
        return entryCost + maxProfit;
    }

    function _clampForSecond(uint256 dealId, uint256 traderId, uint256 desired)
        internal
        view
        returns (uint256)
    {
        MarginCallEscrow.Deal memory deal = escrow.getDeal(dealId);
        MarginCallEscrow.EntryInfo memory entry = escrow.getEntry(dealId, traderId);
        uint256 available = deal.potAmount - deal.reservedAmount + entry.entryCost;
        uint256 maxByCap = entry.entryCost + deal.maxExtractionAmount;
        return _min(desired, _min(deal.potAmount, _min(available, maxByCap)));
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
