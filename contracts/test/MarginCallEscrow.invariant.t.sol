// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {MarginCallEscrow} from "../src/MarginCallEscrow.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";

/// @dev Handler for stateful escrow invariants (USDC conservation, reserves, fees).
contract EscrowHandler is Test {
    MarginCallEscrow public escrow;
    MockERC20 public usdc;
    MockIdentityRegistry public registry;

    address public settlementOp;
    address public depositorBinder;
    address public alice;
    address public bob;

    uint256 public constant TRADER_A = 1;
    uint256 public constant TRADER_B = 2;
    uint256 public constant ENTRY_TIMEOUT = 3600;

    uint256[] public openDealIds;

    constructor(
        MarginCallEscrow escrow_,
        MockERC20 usdc_,
        MockIdentityRegistry registry_,
        address settlementOp_,
        address depositorBinder_,
        address alice_,
        address bob_
    ) {
        escrow = escrow_;
        usdc = usdc_;
        registry = registry_;
        settlementOp = settlementOp_;
        depositorBinder = depositorBinder_;
        alice = alice_;
        bob = bob_;
    }

    function createDeal(uint256 potSeed, uint256 entrySeed) external {
        uint256 potAmount = bound(potSeed, 4e6, 50_000e6);
        uint256 entryCost = bound(entrySeed, 1e6, potAmount / 4);
        uint256 net = potAmount - (potAmount * 5) / 100;
        if (net * 2500 < 10_000) return;

        vm.prank(alice);
        uint256 dealId = escrow.createDeal("inv", potAmount, entryCost);
        openDealIds.push(dealId);
    }

    function depositAndEnter(uint256 dealSeed) external {
        if (openDealIds.length == 0) return;
        uint256 idx = bound(dealSeed, 0, openDealIds.length - 1);
        uint256 dealId = openDealIds[idx];
        MarginCallEscrow.Deal memory deal = escrow.getDeal(dealId);
        if (deal.status != MarginCallEscrow.DealStatus.Open) return;
        if (escrow.hasPendingEntry(dealId, TRADER_B)) return;

        vm.prank(bob);
        escrow.depositFor(TRADER_B, deal.entryCost);
        vm.prank(settlementOp);
        try escrow.enterDeal(dealId, TRADER_B) {} catch {}
    }

    function settleBreakEven(uint256 dealSeed) external {
        if (openDealIds.length == 0) return;
        uint256 idx = bound(dealSeed, 0, openDealIds.length - 1);
        uint256 dealId = openDealIds[idx];
        if (!escrow.hasPendingEntry(dealId, TRADER_B)) return;

        MarginCallEscrow.EntryInfo memory entry = escrow.getEntry(dealId, TRADER_B);
        vm.prank(settlementOp);
        try escrow.settleEntry(dealId, TRADER_B, entry.entryCost, 0) {} catch {}
    }

    function settleMaxWin(uint256 dealSeed) external {
        if (openDealIds.length == 0) return;
        uint256 idx = bound(dealSeed, 0, openDealIds.length - 1);
        uint256 dealId = openDealIds[idx];
        if (!escrow.hasPendingEntry(dealId, TRADER_B)) return;

        MarginCallEscrow.Deal memory deal = escrow.getDeal(dealId);
        MarginCallEscrow.EntryInfo memory entry = escrow.getEntry(dealId, TRADER_B);
        uint256 available = deal.potAmount - deal.reservedAmount + entry.entryCost;
        uint256 gross = entry.entryCost + deal.maxExtractionAmount;
        if (gross > available) gross = available;
        if (gross > deal.potAmount) gross = deal.potAmount;

        vm.prank(settlementOp);
        try escrow.settleEntry(dealId, TRADER_B, gross, 0) {} catch {}
    }

    function refundExpired(uint256 dealSeed) external {
        if (openDealIds.length == 0) return;
        uint256 idx = bound(dealSeed, 0, openDealIds.length - 1);
        uint256 dealId = openDealIds[idx];
        if (!escrow.hasPendingEntry(dealId, TRADER_B)) return;

        vm.warp(block.timestamp + ENTRY_TIMEOUT + 1);
        try escrow.refundExpiredEntry(dealId, TRADER_B) {} catch {}
    }

    function closeDeal(uint256 dealSeed) external {
        if (openDealIds.length == 0) return;
        uint256 idx = bound(dealSeed, 0, openDealIds.length - 1);
        uint256 dealId = openDealIds[idx];
        MarginCallEscrow.Deal memory deal = escrow.getDeal(dealId);
        if (deal.status != MarginCallEscrow.DealStatus.Open) return;
        if (deal.pendingEntries != 0) return;

        vm.prank(alice);
        try escrow.closeDeal(dealId) {} catch {}
    }

    function withdrawFees() external {
        if (escrow.platformFees() == 0) return;
        vm.prank(escrow.owner());
        try escrow.withdrawFees() {} catch {}
    }

    function withdrawTrader(uint256 amountSeed) external {
        uint256 bal = escrow.getBalance(TRADER_B);
        if (bal == 0) return;
        uint256 amount = bound(amountSeed, 1, bal);
        vm.prank(bob);
        try escrow.withdraw(TRADER_B, amount) {} catch {}
    }
}

contract MarginCallEscrowInvariantTest is StdInvariant, Test {
    MarginCallEscrow public escrow;
    MockERC20 public usdc;
    MockIdentityRegistry public registry;
    EscrowHandler public handler;

    address settlementOp = address(0xBEEF);
    address depositorBinder = address(0xB1DE);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        registry = new MockIdentityRegistry();
        escrow = new MarginCallEscrow(address(usdc), address(registry), settlementOp, depositorBinder, 3600);

        registry.setOwner(1, alice);
        registry.setOwner(2, bob);
        vm.prank(depositorBinder);
        escrow.setDepositor(1, alice);
        vm.prank(depositorBinder);
        escrow.setDepositor(2, bob);

        usdc.mint(alice, 1_000_000_000e6);
        usdc.mint(bob, 1_000_000_000e6);
        vm.prank(alice);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(escrow), type(uint256).max);

        handler = new EscrowHandler(escrow, usdc, registry, settlementOp, depositorBinder, alice, bob);
        // Fund handler path is via alice/bob approvals; target the handler.
        targetContract(address(handler));
    }

    /// ledger: escrow USDC == platformFees + Σ balances + Σ open potAmount
    /// (external donations are out of scope; handler never donates).
    function invariant_usdcConservation() public view {
        uint256 accounted = escrow.platformFees();
        accounted += escrow.getBalance(1);
        accounted += escrow.getBalance(2);

        uint256 dealCount = escrow.dealCount();
        for (uint256 i = 0; i < dealCount; i++) {
            MarginCallEscrow.Deal memory deal = escrow.getDeal(i);
            if (deal.status == MarginCallEscrow.DealStatus.Open) {
                accounted += deal.potAmount;
            }
        }

        assertEq(usdc.balanceOf(address(escrow)), accounted, "USDC conservation");
    }

    function invariant_reservedMatchesPending() public view {
        uint256 dealCount = escrow.dealCount();
        for (uint256 i = 0; i < dealCount; i++) {
            MarginCallEscrow.Deal memory deal = escrow.getDeal(i);
            if (deal.status != MarginCallEscrow.DealStatus.Open) continue;
            // With a single entry-cost per deal, reserved == pendingEntries * entryCost
            // when every pending entry paid that deal's entryCost (always true in this protocol).
            assertEq(deal.reservedAmount, deal.pendingEntries * deal.entryCost, "reserved vs pending");
            assertGe(deal.potAmount, deal.reservedAmount, "pot solvency");
        }
    }

    function invariant_feesNonNegative() public view {
        // platformFees is uint256; assert withdraw accounting never overdraws escrow.
        assertLe(escrow.platformFees(), usdc.balanceOf(address(escrow)));
    }
}
