// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MarginCallEscrow} from "../src/MarginCallEscrow.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";
import {MockSeatVault} from "./mocks/MockSeatVault.sol";

contract MarginCallEscrowTest is Test {
    MarginCallEscrow public escrow;
    MockERC20 public usdc;
    MockIdentityRegistry public registry;
    MockSeatVault public seatVault;

    address owner = address(this);
    address settlementOp = address(0xBEEF);
    address depositorBinder = address(0xB1DE);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address eve = address(0xE7E);

    uint256 constant TRADER_A = 1;
    uint256 constant TRADER_B = 2;
    uint256 constant ENTRY_TIMEOUT = 3600;

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        registry = new MockIdentityRegistry();
        seatVault = new MockSeatVault();
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

        usdc.mint(alice, 1_000_000e6);
        usdc.mint(bob, 1_000_000e6);
        usdc.mint(eve, 1_000_000e6);

        vm.prank(alice);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(eve);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _grossPayout(uint256 entryCost, int256 pnl, uint256 rake) internal pure returns (uint256) {
        int256 total = int256(entryCost) + pnl + int256(rake);
        if (total <= 0) return 0;
        return uint256(total);
    }

    // ========== Deal Creation ==========

    function test_createDeal() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Oil futures pump", 1000e6, 100e6);

        MarginCallEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(deal.creator, alice);
        assertEq(deal.potAmount, 950e6);
        assertEq(deal.entryCost, 100e6);
        assertEq(deal.fee, 50e6);
        assertEq(uint8(deal.status), uint8(MarginCallEscrow.DealStatus.Open));
        assertEq(deal.pendingEntries, 0);
        assertEq(deal.reservedAmount, 0);
        assertEq(deal.maxExtractionAmount, (950e6 * 2500) / 10_000);
        assertEq(escrow.platformFees(), 50e6);
        assertEq(dealId, 0);
    }

    function test_createDeal_incrementsId() public {
        vm.startPrank(alice);
        uint256 id0 = escrow.createDeal("Deal 0", 100e6, 10e6);
        uint256 id1 = escrow.createDeal("Deal 1", 100e6, 10e6);
        vm.stopPrank();

        assertEq(id0, 0);
        assertEq(id1, 1);
        assertEq(escrow.dealCount(), 2);
    }

    function test_createDeal_revertsZeroPot() public {
        vm.prank(alice);
        vm.expectRevert("Pot must be > 0");
        escrow.createDeal("Bad deal", 0, 100e6);
    }

    function test_createDeal_revertsZeroEntryCost() public {
        vm.prank(alice);
        vm.expectRevert("Entry cost must be > 0");
        escrow.createDeal("Bad deal", 100e6, 0);
    }

    // ========== Close Deal ==========

    function test_closeDeal() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Close me", 1000e6, 100e6);

        uint256 balBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        escrow.closeDeal(dealId);

        MarginCallEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(uint8(deal.status), uint8(MarginCallEscrow.DealStatus.Closed));
        assertEq(deal.potAmount, 0);
        assertEq(usdc.balanceOf(alice), balBefore + 950e6);
    }

    function test_closeDeal_revertsIfNotCreator() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("My deal", 1000e6, 100e6);

        vm.prank(bob);
        vm.expectRevert("Not deal creator");
        escrow.closeDeal(dealId);
    }

    function test_closeDeal_revertsIfPendingEntries() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Active deal", 1000e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);
        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);

        vm.prank(alice);
        vm.expectRevert("Pending entries exist");
        escrow.closeDeal(dealId);
    }

    function test_closeDeal_revertsIfAlreadyClosed() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Close twice", 1000e6, 100e6);

        vm.prank(alice);
        escrow.closeDeal(dealId);

        vm.prank(alice);
        vm.expectRevert("Deal not open");
        escrow.closeDeal(dealId);
    }

    // ========== Depositor ==========

    function test_setDepositor() public {
        vm.prank(depositorBinder);
        escrow.setDepositor(TRADER_A, eve);
        assertEq(escrow.depositors(TRADER_A), eve);
    }

    function test_setDepositor_revertsIfNotDepositorBinder() public {
        vm.prank(settlementOp);
        vm.expectRevert("Not depositor binder");
        escrow.setDepositor(TRADER_A, eve);
    }

    function test_setDepositor_revertsIfZeroAddress() public {
        vm.prank(depositorBinder);
        vm.expectRevert("Zero depositor");
        escrow.setDepositor(TRADER_A, address(0));
    }

    function test_setDepositor_emitsEvent() public {
        vm.prank(depositorBinder);
        vm.expectEmit(true, true, false, false);
        emit MarginCallEscrow.DepositorSet(TRADER_A, eve);
        escrow.setDepositor(TRADER_A, eve);
    }

    function test_setDepositor_revertsWhenSeatVaultLocked() public {
        escrow.setSeatVault(address(seatVault));
        seatVault.setLocked(TRADER_A, true);

        vm.prank(depositorBinder);
        vm.expectRevert("Depositor locked while vault principal");
        escrow.setDepositor(TRADER_A, eve);
    }

    // ========== Deposit / Withdraw ==========

    function test_depositFor() public {
        vm.prank(alice);
        escrow.depositFor(TRADER_A, 500e6);

        assertEq(escrow.getBalance(TRADER_A), 500e6);
        assertEq(usdc.balanceOf(address(escrow)), 500e6);
    }

    function test_depositFor_revertsIfNotDepositor() public {
        vm.prank(bob);
        vm.expectRevert("Not depositor");
        escrow.depositFor(TRADER_A, 500e6);
    }

    function test_withdraw() public {
        vm.prank(alice);
        escrow.depositFor(TRADER_A, 500e6);

        uint256 balBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        escrow.withdraw(TRADER_A, 200e6);

        assertEq(escrow.getBalance(TRADER_A), 300e6);
        assertEq(usdc.balanceOf(alice), balBefore + 200e6);
    }

    function test_withdraw_revertsIfNotDepositor() public {
        vm.prank(alice);
        escrow.depositFor(TRADER_A, 500e6);

        vm.prank(bob);
        vm.expectRevert("Not depositor");
        escrow.withdraw(TRADER_A, 200e6);
    }

    function test_withdraw_revertsIfInsufficientBalance() public {
        vm.prank(alice);
        escrow.depositFor(TRADER_A, 100e6);

        vm.prank(alice);
        vm.expectRevert("Insufficient balance");
        escrow.withdraw(TRADER_A, 200e6);
    }

    // ========== Enter Deal ==========

    function test_enterDeal() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Enter me", 1000e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);

        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);

        MarginCallEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(deal.potAmount, 950e6 + 100e6);
        assertEq(deal.pendingEntries, 1);
        assertEq(deal.reservedAmount, 100e6);
        assertEq(escrow.getBalance(TRADER_B), 100e6);
        assertTrue(escrow.hasPendingEntry(dealId, TRADER_B));
    }

    function test_enterDeal_revertsOwnDesk() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Own desk", 1000e6, 100e6);

        vm.prank(alice);
        escrow.depositFor(TRADER_A, 200e6);

        vm.prank(settlementOp);
        vm.expectRevert("Own desk entry");
        escrow.enterDeal(dealId, TRADER_A);
    }

    function test_enterDeal_revertsIfNotSettlementOperator() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Guarded", 1000e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);

        vm.prank(alice);
        vm.expectRevert("Not settlement operator");
        escrow.enterDeal(dealId, TRADER_B);
    }

    function test_enterDeal_revertsIfDealClosed() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Closed deal", 1000e6, 100e6);
        vm.prank(alice);
        escrow.closeDeal(dealId);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);

        vm.prank(settlementOp);
        vm.expectRevert("Deal not open");
        escrow.enterDeal(dealId, TRADER_B);
    }

    function test_enterDeal_revertsIfInsufficientBalance() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Expensive", 1000e6, 500e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 100e6);

        vm.prank(settlementOp);
        vm.expectRevert("Insufficient trader balance");
        escrow.enterDeal(dealId, TRADER_B);
    }

    function test_enterDeal_revertsIfAlreadyEntered() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Dup", 1000e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 300e6);
        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);

        vm.prank(settlementOp);
        vm.expectRevert("Already entered");
        escrow.enterDeal(dealId, TRADER_B);
    }

    function test_enterDeal_revertsIfDealDoesNotExist() public {
        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);

        vm.prank(settlementOp);
        vm.expectRevert("Deal does not exist");
        escrow.enterDeal(999, TRADER_B);
    }

    // ========== Settle Entry ==========

    function test_settleEntry_win() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Winner", 1000e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);

        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);

        uint256 gross = _grossPayout(100e6, 200e6, 10e6);
        uint256 potBefore = escrow.getDeal(dealId).potAmount;
        uint256 feesBefore = escrow.platformFees();

        vm.prank(settlementOp);
        escrow.settleEntry(dealId, TRADER_B, gross, 10e6);

        MarginCallEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(deal.potAmount, potBefore - gross);
        assertEq(deal.pendingEntries, 0);
        assertEq(deal.reservedAmount, 0);
        assertEq(escrow.getBalance(TRADER_B), 100e6 + gross - 10e6);
        assertEq(escrow.platformFees(), feesBefore + 10e6);
    }

    function test_settleEntry_loss() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Loser", 1000e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);

        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);

        uint256 gross = _grossPayout(100e6, -50e6, 0);
        uint256 potBefore = escrow.getDeal(dealId).potAmount;

        vm.prank(settlementOp);
        escrow.settleEntry(dealId, TRADER_B, gross, 0);

        MarginCallEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(deal.potAmount, potBefore - gross);
        assertEq(deal.pendingEntries, 0);
        assertEq(escrow.getBalance(TRADER_B), 100e6 + gross);
    }

    function test_settleEntry_zero() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Flat", 1000e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);

        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);

        uint256 gross = _grossPayout(100e6, 0, 0);
        uint256 potBefore = escrow.getDeal(dealId).potAmount;

        vm.prank(settlementOp);
        escrow.settleEntry(dealId, TRADER_B, gross, 0);

        assertEq(escrow.getDeal(dealId).potAmount, potBefore - gross);
        assertEq(escrow.getBalance(TRADER_B), 100e6 + gross);
    }

    function test_settleEntry_revertsIfGrossExceedsPot() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Small pot", 200e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);

        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);

        uint256 gross = _grossPayout(100e6, 500e6, 0);
        vm.prank(settlementOp);
        vm.expectRevert("Gross exceeds pot");
        escrow.settleEntry(dealId, TRADER_B, gross, 0);
    }

    function test_settleEntry_revertsIfExceedsExtractionCap() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Capped", 1000e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 500e6);

        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);

        uint256 gross = _grossPayout(100e6, 300e6, 0);
        vm.prank(settlementOp);
        vm.expectRevert("Exceeds extraction cap");
        escrow.settleEntry(dealId, TRADER_B, gross, 0);
    }

    function test_settleEntry_revertsIfNotSettlementOperator() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Guarded", 1000e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);

        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);

        vm.prank(alice);
        vm.expectRevert("Not settlement operator");
        escrow.settleEntry(dealId, TRADER_B, _grossPayout(100e6, 100e6, 5e6), 5e6);
    }

    function test_settleEntry_revertsIfNoPendingEntry() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Empty", 1000e6, 100e6);

        vm.prank(settlementOp);
        vm.expectRevert("No pending entry");
        escrow.settleEntry(dealId, TRADER_B, _grossPayout(100e6, 100e6, 0), 0);
    }

    function test_settleEntry_revertsIfTraderMismatch() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Mismatch", 1000e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);
        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);

        vm.prank(settlementOp);
        vm.expectRevert("No pending entry");
        escrow.settleEntry(dealId, TRADER_A, _grossPayout(100e6, 50e6, 0), 0);
    }

    function test_settleEntry_outOfOrder() public {
        vm.prank(eve);
        uint256 dealId = escrow.createDeal("Out of order", 2000e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);
        vm.prank(alice);
        escrow.depositFor(TRADER_A, 200e6);

        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);
        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_A);

        uint256 grossB = _grossPayout(100e6, 100e6, 10e6);
        vm.prank(settlementOp);
        escrow.settleEntry(dealId, TRADER_B, grossB, 10e6);
        assertEq(escrow.getBalance(TRADER_B), 100e6 + grossB - 10e6);

        uint256 grossA = _grossPayout(100e6, -50e6, 0);
        vm.prank(settlementOp);
        escrow.settleEntry(dealId, TRADER_A, grossA, 0);
        assertEq(escrow.getBalance(TRADER_A), 100e6 + grossA);
    }

    function test_settleEntry_revertsIfRakeExceedsProfit() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Rake", 1000e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);
        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);

        uint256 gross = _grossPayout(100e6, 100e6, 0);
        vm.prank(settlementOp);
        vm.expectRevert("Rake exceeds profit");
        escrow.settleEntry(dealId, TRADER_B, gross, 101e6);
    }

    function test_settleEntry_revertsIfDealDoesNotExist() public {
        vm.prank(settlementOp);
        vm.expectRevert("Deal does not exist");
        escrow.settleEntry(999, TRADER_A, 0, 0);
    }

    function test_multipleEntriesResolveInAnyOrder() public {
        vm.prank(eve);
        uint256 dealId = escrow.createDeal("Parallel", 2000e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);
        vm.prank(alice);
        escrow.depositFor(TRADER_A, 200e6);

        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);
        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_A);

        assertEq(escrow.getBalance(TRADER_A), 100e6);
        assertEq(escrow.getBalance(TRADER_B), 100e6);

        uint256 grossA = _grossPayout(100e6, -50e6, 0);
        vm.prank(settlementOp);
        escrow.settleEntry(dealId, TRADER_A, grossA, 0);
        assertEq(escrow.getBalance(TRADER_A), 100e6 + grossA);
        assertEq(escrow.getBalance(TRADER_B), 100e6);

        uint256 grossB = _grossPayout(100e6, 100e6, 10e6);
        vm.prank(settlementOp);
        escrow.settleEntry(dealId, TRADER_B, grossB, 10e6);
        assertEq(escrow.getBalance(TRADER_B), 100e6 + grossB - 10e6);
    }

    // ========== Timeout Refund ==========

    function test_refundExpiredEntry() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Timeout", 1000e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);

        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);

        uint256 potBefore = escrow.getDeal(dealId).potAmount;
        vm.warp(block.timestamp + ENTRY_TIMEOUT + 1);

        escrow.refundExpiredEntry(dealId, TRADER_B);

        MarginCallEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(deal.potAmount, potBefore - 100e6);
        assertEq(deal.pendingEntries, 0);
        assertEq(deal.reservedAmount, 0);
        assertEq(escrow.getBalance(TRADER_B), 200e6);
        assertFalse(escrow.hasPendingEntry(dealId, TRADER_B));
    }

    function test_refundExpiredEntry_revertsBeforeTimeout() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Not expired", 1000e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);

        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);

        vm.expectRevert("Entry not expired");
        escrow.refundExpiredEntry(dealId, TRADER_B);
    }

    // ========== Pause ==========

    function test_pause_blocksMutatingOps_allowsWithdrawRefundClose() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Paused", 1000e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);

        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);

        escrow.pause();

        vm.prank(alice);
        vm.expectRevert("Paused");
        escrow.createDeal("Blocked", 100e6, 10e6);

        vm.prank(settlementOp);
        vm.expectRevert("Paused");
        escrow.enterDeal(dealId, TRADER_B);

        vm.prank(settlementOp);
        vm.expectRevert("Paused");
        escrow.settleEntry(dealId, TRADER_B, _grossPayout(100e6, 0, 0), 0);

        vm.prank(bob);
        escrow.withdraw(TRADER_B, 50e6);
        assertEq(escrow.getBalance(TRADER_B), 50e6);

        vm.warp(block.timestamp + ENTRY_TIMEOUT + 1);
        escrow.refundExpiredEntry(dealId, TRADER_B);
        assertEq(escrow.getBalance(TRADER_B), 150e6);

        vm.prank(alice);
        escrow.closeDeal(dealId);
        assertEq(uint8(escrow.getDeal(dealId).status), uint8(MarginCallEscrow.DealStatus.Closed));
    }

    function test_settlementOperatorCannotPauseOrBindOrAddOperator() public {
        vm.prank(settlementOp);
        vm.expectRevert("Not pauser");
        escrow.pause();

        vm.prank(settlementOp);
        vm.expectRevert("Not depositor binder");
        escrow.setDepositor(TRADER_A, eve);

        vm.prank(settlementOp);
        vm.expectRevert("Not owner");
        escrow.addSettlementOperator(address(0xCAFE));
    }

    // ========== Fee Withdrawal ==========

    function test_withdrawFees() public {
        vm.prank(alice);
        escrow.createDeal("Fee generator", 1000e6, 100e6);

        uint256 fees = escrow.platformFees();
        assertEq(fees, 50e6);

        uint256 ownerBalBefore = usdc.balanceOf(owner);
        escrow.withdrawFees();

        assertEq(escrow.platformFees(), 0);
        assertEq(usdc.balanceOf(owner), ownerBalBefore + 50e6);
    }

    function test_withdrawFees_revertsIfNotOwner() public {
        vm.prank(alice);
        escrow.createDeal("Fee generator", 1000e6, 100e6);

        vm.prank(alice);
        vm.expectRevert("Not owner");
        escrow.withdrawFees();
    }

    function test_withdrawFees_revertsIfNoFees() public {
        vm.expectRevert("No fees to withdraw");
        escrow.withdrawFees();
    }

    function test_setDepositor_revertsWhenBalanceNonZero() public {
        vm.prank(alice);
        escrow.depositFor(TRADER_A, 100e6);

        vm.prank(depositorBinder);
        vm.expectRevert("Depositor locked while balance > 0");
        escrow.setDepositor(TRADER_A, eve);
    }

    function test_closeDeal_revertsIfDealDoesNotExist() public {
        vm.prank(alice);
        vm.expectRevert("Deal does not exist");
        escrow.closeDeal(999);
    }

    // ========== Access Control ==========

    function test_addSettlementOperator() public {
        address newOp = address(0xCAFE);
        escrow.addSettlementOperator(newOp);
        assertTrue(escrow.settlementOperators(newOp));
    }

    function test_addSettlementOperator_revertsIfNotOwner() public {
        vm.prank(alice);
        vm.expectRevert("Not owner");
        escrow.addSettlementOperator(address(0xCAFE));
    }

    function test_removeSettlementOperator() public {
        assertTrue(escrow.settlementOperators(settlementOp));
        escrow.removeSettlementOperator(settlementOp);
        assertFalse(escrow.settlementOperators(settlementOp));
    }

    function test_removeSettlementOperator_revokesAccess() public {
        escrow.removeSettlementOperator(settlementOp);

        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Guarded", 1000e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);

        vm.prank(settlementOp);
        vm.expectRevert("Not settlement operator");
        escrow.enterDeal(dealId, TRADER_B);
    }

    function test_addDepositorBinder() public {
        address newBinder = address(0xCAFE);
        escrow.addDepositorBinder(newBinder);
        assertTrue(escrow.depositorBinders(newBinder));
    }

    function test_multipleSettlementOperators() public {
        address op2 = address(0xCAFE);
        escrow.addSettlementOperator(op2);

        vm.prank(eve);
        uint256 dealId = escrow.createDeal("Multi-op", 1000e6, 100e6);
        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);
        vm.prank(alice);
        escrow.depositFor(TRADER_A, 200e6);

        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);

        vm.prank(op2);
        escrow.enterDeal(dealId, TRADER_A);

        assertEq(escrow.getDeal(dealId).pendingEntries, 2);
    }

    // ========== Constructor Zero-Address ==========

    function test_constructor_revertsIfZeroUsdc() public {
        vm.expectRevert("Zero USDC");
        new MarginCallEscrow(address(0), address(registry), settlementOp, depositorBinder, ENTRY_TIMEOUT);
    }

    function test_constructor_revertsIfZeroRegistry() public {
        vm.expectRevert("Zero registry");
        new MarginCallEscrow(address(usdc), address(0), settlementOp, depositorBinder, ENTRY_TIMEOUT);
    }

    function test_constructor_revertsIfZeroSettlementOperator() public {
        vm.expectRevert("Zero settlement operator");
        new MarginCallEscrow(address(usdc), address(registry), address(0), depositorBinder, ENTRY_TIMEOUT);
    }

    function test_constructor_revertsIfZeroDepositorBinder() public {
        vm.expectRevert("Zero depositor binder");
        new MarginCallEscrow(address(usdc), address(registry), settlementOp, address(0), ENTRY_TIMEOUT);
    }

    function test_constructor_revertsIfZeroTimeout() public {
        vm.expectRevert("Zero timeout");
        new MarginCallEscrow(address(usdc), address(registry), settlementOp, depositorBinder, 0);
    }
}
