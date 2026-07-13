// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MarginCallEscrow} from "../src/MarginCallEscrow.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";

/// @notice Full local flow: create → fund → enter → win/loss/refund → close → withdraw.
contract MarginCallEscrowE2ETest is Test {
    MarginCallEscrow public escrow;
    MockERC20 public usdc;
    MockIdentityRegistry public registry;

    address settlementOp = address(0xBEEF);
    address depositorBinder = address(0xB1DE);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA201);

    uint256 constant TRADER_A = 1;
    uint256 constant TRADER_B = 2;
    uint256 constant TRADER_C = 3;
    uint256 constant ENTRY_TIMEOUT = 3600;

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        registry = new MockIdentityRegistry();
        escrow = new MarginCallEscrow(address(usdc), address(registry), settlementOp, depositorBinder, ENTRY_TIMEOUT);

        registry.setOwner(TRADER_A, alice);
        registry.setOwner(TRADER_B, bob);
        registry.setOwner(TRADER_C, carol);

        vm.prank(depositorBinder);
        escrow.setDepositor(TRADER_A, alice);
        vm.prank(depositorBinder);
        escrow.setDepositor(TRADER_B, bob);
        vm.prank(depositorBinder);
        escrow.setDepositor(TRADER_C, carol);

        usdc.mint(alice, 10_000_000e6);
        usdc.mint(bob, 10_000_000e6);
        usdc.mint(carol, 10_000_000e6);
        vm.prank(alice);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(carol);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function test_e2e_createFundEnterWinLossRefundCloseWithdraw() public {
        // Alice creates a deal (5% fee → net 950e6, maxExtraction 237.5e6).
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("E2E street deal", 1000e6, 100e6);
        assertEq(escrow.platformFees(), 50e6);

        // Fund traders.
        vm.prank(bob);
        escrow.depositFor(TRADER_B, 500e6);
        vm.prank(carol);
        escrow.depositFor(TRADER_C, 500e6);

        // Enter: Bob (win path), Carol (refund path) — need a third for loss.
        address dave = address(0xDA7E);
        uint256 traderD = 4;
        registry.setOwner(traderD, dave);
        vm.prank(depositorBinder);
        escrow.setDepositor(traderD, dave);
        usdc.mint(dave, 1_000_000e6);
        vm.prank(dave);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(dave);
        escrow.depositFor(traderD, 500e6);

        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);
        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_C);
        vm.prank(settlementOp);
        escrow.enterDeal(dealId, traderD);

        MarginCallEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(deal.pendingEntries, 3);
        assertEq(deal.reservedAmount, 300e6);

        // Win: Bob takes max profit, no rake.
        uint256 maxGross = 100e6 + deal.maxExtractionAmount;
        vm.prank(settlementOp);
        escrow.settleEntry(dealId, TRADER_B, maxGross, 0);
        assertEq(escrow.getBalance(TRADER_B), 400e6 + maxGross); // 500-100+maxGross

        // Loss: Dave gets 0.
        vm.prank(settlementOp);
        escrow.settleEntry(dealId, traderD, 0, 0);
        assertEq(escrow.getBalance(traderD), 400e6);

        // Refund: Carol after timeout.
        vm.warp(block.timestamp + ENTRY_TIMEOUT + 1);
        escrow.refundExpiredEntry(dealId, TRADER_C);
        assertEq(escrow.getBalance(TRADER_C), 500e6);
        assertEq(escrow.getDeal(dealId).pendingEntries, 0);

        // Close residual pot to Alice + withdraw fees + trader withdraw.
        uint256 potLeft = escrow.getDeal(dealId).potAmount;
        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        escrow.closeDeal(dealId);
        assertEq(usdc.balanceOf(alice), aliceBefore + potLeft);

        uint256 ownerBefore = usdc.balanceOf(address(this));
        uint256 fees = escrow.platformFees();
        escrow.withdrawFees();
        assertEq(usdc.balanceOf(address(this)), ownerBefore + fees);
        assertEq(escrow.platformFees(), 0);

        uint256 bobUsdcBefore = usdc.balanceOf(bob);
        uint256 bobEscrow = escrow.getBalance(TRADER_B);
        vm.prank(bob);
        escrow.withdraw(TRADER_B, bobEscrow);
        assertEq(usdc.balanceOf(bob), bobUsdcBefore + bobEscrow);
        assertEq(escrow.getBalance(TRADER_B), 0);

        // Escrow holds only remaining trader balances (Carol + Dave).
        assertEq(usdc.balanceOf(address(escrow)), escrow.getBalance(TRADER_C) + escrow.getBalance(traderD));
    }
}
