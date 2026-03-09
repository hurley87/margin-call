// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MarginCallEscrow} from "../src/MarginCallEscrow.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";

contract MarginCallEscrowTest is Test {
    MarginCallEscrow public escrow;
    MockERC20 public usdc;
    MockIdentityRegistry public registry;

    address owner = address(this);
    address operatorAddr = address(0xBEEF);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address eve = address(0xE7E);

    uint256 constant TRADER_A = 1;
    uint256 constant TRADER_B = 2;

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        registry = new MockIdentityRegistry();
        escrow = new MarginCallEscrow(address(usdc), address(registry), operatorAddr);

        // Assign NFT ownership
        registry.setOwner(TRADER_A, alice);
        registry.setOwner(TRADER_B, bob);

        // Set depositors (alice deposits for TRADER_A, bob for TRADER_B)
        vm.prank(operatorAddr);
        escrow.setDepositor(TRADER_A, alice);
        vm.prank(operatorAddr);
        escrow.setDepositor(TRADER_B, bob);

        // Mint USDC
        usdc.mint(alice, 1_000_000e6);
        usdc.mint(bob, 1_000_000e6);
        usdc.mint(eve, 1_000_000e6);

        // Approve escrow
        vm.prank(alice);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(eve);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ========== Deal Creation ==========

    function test_createDeal() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Oil futures pump", 1000e6, 100e6);

        MarginCallEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(deal.creator, alice);
        assertEq(deal.potAmount, 950e6); // 95% of 1000
        assertEq(deal.entryCost, 100e6);
        assertEq(deal.fee, 50e6); // 5% of 1000
        assertEq(uint8(deal.status), uint8(MarginCallEscrow.DealStatus.Open));
        assertEq(deal.pendingEntries, 0);
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

        // Deposit and enter
        vm.prank(alice);
        escrow.depositFor(TRADER_A, 200e6);
        vm.prank(operatorAddr);
        escrow.enterDeal(dealId, TRADER_A);

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
        vm.prank(operatorAddr);
        escrow.setDepositor(TRADER_A, eve);
        assertEq(escrow.depositors(TRADER_A), eve);
    }

    function test_setDepositor_revertsIfNotOperator() public {
        vm.prank(alice);
        vm.expectRevert("Not operator");
        escrow.setDepositor(TRADER_A, eve);
    }

    function test_setDepositor_revertsIfZeroAddress() public {
        vm.prank(operatorAddr);
        vm.expectRevert("Zero depositor");
        escrow.setDepositor(TRADER_A, address(0));
    }

    function test_setDepositor_emitsEvent() public {
        vm.prank(operatorAddr);
        vm.expectEmit(true, true, false, false);
        emit MarginCallEscrow.DepositorSet(TRADER_A, eve);
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

        vm.prank(alice);
        escrow.depositFor(TRADER_A, 200e6);

        vm.prank(operatorAddr);
        escrow.enterDeal(dealId, TRADER_A);

        MarginCallEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(deal.potAmount, 950e6 + 100e6); // net pot + entry cost
        assertEq(deal.pendingEntries, 1);
        assertEq(escrow.getBalance(TRADER_A), 100e6); // 200 - 100
    }

    function test_enterDeal_revertsIfNotOperator() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Guarded", 1000e6, 100e6);

        vm.prank(alice);
        escrow.depositFor(TRADER_A, 200e6);

        vm.prank(alice);
        vm.expectRevert("Not operator");
        escrow.enterDeal(dealId, TRADER_A);
    }

    function test_enterDeal_revertsIfDealClosed() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Closed deal", 1000e6, 100e6);
        vm.prank(alice);
        escrow.closeDeal(dealId);

        vm.prank(alice);
        escrow.depositFor(TRADER_A, 200e6);

        vm.prank(operatorAddr);
        vm.expectRevert("Deal not open");
        escrow.enterDeal(dealId, TRADER_A);
    }

    function test_enterDeal_revertsIfInsufficientBalance() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Expensive", 1000e6, 500e6);

        vm.prank(alice);
        escrow.depositFor(TRADER_A, 100e6);

        vm.prank(operatorAddr);
        vm.expectRevert("Insufficient trader balance");
        escrow.enterDeal(dealId, TRADER_A);
    }

    // ========== Resolve Entry (Win) ==========

    function test_resolveEntry_win() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Winner", 1000e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);

        vm.prank(operatorAddr);
        escrow.enterDeal(dealId, TRADER_B);

        // Pot is 950 + 100 = 1050. Trader wins 200 with 10 rake.
        uint256 potBefore = escrow.getDeal(dealId).potAmount;
        uint256 feesBefore = escrow.platformFees();

        vm.prank(operatorAddr);
        escrow.resolveEntry(dealId, TRADER_B, int256(200e6), 10e6);

        MarginCallEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(deal.potAmount, potBefore - 200e6);
        assertEq(deal.pendingEntries, 0);
        assertEq(escrow.getBalance(TRADER_B), 100e6 + 190e6); // remaining deposit + (200 - 10 rake)
        assertEq(escrow.platformFees(), feesBefore + 10e6);
    }

    // ========== Resolve Entry (Loss / Zero) ==========

    function test_resolveEntry_loss() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Loser", 1000e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);

        vm.prank(operatorAddr);
        escrow.enterDeal(dealId, TRADER_B);

        uint256 potBefore = escrow.getDeal(dealId).potAmount;

        vm.prank(operatorAddr);
        escrow.resolveEntry(dealId, TRADER_B, -int256(50e6), 0);

        MarginCallEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(deal.potAmount, potBefore); // pot unchanged on loss
        assertEq(deal.pendingEntries, 0);
        assertEq(escrow.getBalance(TRADER_B), 100e6); // only remaining deposit
    }

    function test_resolveEntry_zero() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Flat", 1000e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);

        vm.prank(operatorAddr);
        escrow.enterDeal(dealId, TRADER_B);

        uint256 potBefore = escrow.getDeal(dealId).potAmount;

        vm.prank(operatorAddr);
        escrow.resolveEntry(dealId, TRADER_B, 0, 0);

        assertEq(escrow.getDeal(dealId).potAmount, potBefore);
        assertEq(escrow.getBalance(TRADER_B), 100e6);
    }

    // ========== Resolve Entry Edge Cases ==========

    function test_resolveEntry_revertsIfPnlExceedsPot() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Small pot", 200e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);

        vm.prank(operatorAddr);
        escrow.enterDeal(dealId, TRADER_B);

        // Pot = 190 + 100 = 290. Try to win 500.
        vm.prank(operatorAddr);
        vm.expectRevert("PnL exceeds pot");
        escrow.resolveEntry(dealId, TRADER_B, int256(500e6), 0);
    }

    function test_resolveEntry_revertsIfNotOperator() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Guarded", 1000e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);

        vm.prank(operatorAddr);
        escrow.enterDeal(dealId, TRADER_B);

        vm.prank(alice);
        vm.expectRevert("Not operator");
        escrow.resolveEntry(dealId, TRADER_B, int256(100e6), 5e6);
    }

    function test_resolveEntry_revertsIfNoPendingEntries() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Empty", 1000e6, 100e6);

        vm.prank(operatorAddr);
        vm.expectRevert("No pending entries");
        escrow.resolveEntry(dealId, TRADER_B, int256(100e6), 0);
    }

    function test_resolveEntry_revertsIfTraderMismatch() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Mismatch", 1000e6, 100e6);

        vm.prank(alice);
        escrow.depositFor(TRADER_A, 200e6);
        vm.prank(operatorAddr);
        escrow.enterDeal(dealId, TRADER_A);

        // Resolve for TRADER_B instead of TRADER_A
        vm.prank(operatorAddr);
        vm.expectRevert("Trader mismatch");
        escrow.resolveEntry(dealId, TRADER_B, int256(50e6), 0);
    }

    function test_resolveEntry_revertsIfRakeExceedsWinnings() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Rake", 1000e6, 100e6);

        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);
        vm.prank(operatorAddr);
        escrow.enterDeal(dealId, TRADER_B);

        vm.prank(operatorAddr);
        vm.expectRevert("Rake exceeds winnings");
        escrow.resolveEntry(dealId, TRADER_B, int256(100e6), 150e6);
    }

    function test_enterDeal_revertsIfDealDoesNotExist() public {
        vm.prank(alice);
        escrow.depositFor(TRADER_A, 200e6);

        vm.prank(operatorAddr);
        vm.expectRevert("Deal does not exist");
        escrow.enterDeal(999, TRADER_A);
    }

    function test_resolveEntry_revertsIfDealDoesNotExist() public {
        vm.prank(operatorAddr);
        vm.expectRevert("Deal does not exist");
        escrow.resolveEntry(999, TRADER_A, int256(0), 0);
    }

    function test_closeDeal_revertsIfDealDoesNotExist() public {
        vm.prank(alice);
        vm.expectRevert("Deal does not exist");
        escrow.closeDeal(999);
    }

    function test_multipleEntriesResolveInFifoOrder() public {
        vm.prank(alice);
        uint256 dealId = escrow.createDeal("FIFO", 2000e6, 100e6);

        vm.prank(alice);
        escrow.depositFor(TRADER_A, 200e6);
        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);

        vm.prank(operatorAddr);
        escrow.enterDeal(dealId, TRADER_A);
        vm.prank(operatorAddr);
        escrow.enterDeal(dealId, TRADER_B);

        // After both entries: A and B each paid 100, so A=100e6, B=100e6
        assertEq(escrow.getBalance(TRADER_A), 100e6);
        assertEq(escrow.getBalance(TRADER_B), 100e6);

        // Resolve A first (head of queue, loss)
        vm.prank(operatorAddr);
        escrow.resolveEntry(dealId, TRADER_A, -int256(50e6), 0);
        assertEq(escrow.getBalance(TRADER_A), 100e6);
        assertEq(escrow.getBalance(TRADER_B), 100e6);

        // Then B (win 100, rake 10 -> net +90)
        vm.prank(operatorAddr);
        escrow.resolveEntry(dealId, TRADER_B, int256(100e6), 10e6);
        assertEq(escrow.getBalance(TRADER_B), 100e6 + 90e6);
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

    // ========== Access Control ==========

    function test_addOperator() public {
        address newOp = address(0xCAFE);
        escrow.addOperator(newOp);
        assertTrue(escrow.authorizedOperators(newOp));
    }

    function test_addOperator_revertsIfNotOwner() public {
        vm.prank(alice);
        vm.expectRevert("Not owner");
        escrow.addOperator(address(0xCAFE));
    }

    function test_addOperator_revertsIfZero() public {
        vm.expectRevert("Zero operator");
        escrow.addOperator(address(0));
    }

    function test_removeOperator() public {
        assertTrue(escrow.authorizedOperators(operatorAddr));
        escrow.removeOperator(operatorAddr);
        assertFalse(escrow.authorizedOperators(operatorAddr));
    }

    function test_removeOperator_revokesAccess() public {
        escrow.removeOperator(operatorAddr);

        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Guarded", 1000e6, 100e6);

        // Re-add operator to set depositor, then remove again
        escrow.addOperator(address(this));
        escrow.setDepositor(TRADER_A, alice);
        escrow.removeOperator(address(this));

        vm.prank(alice);
        escrow.depositFor(TRADER_A, 200e6);

        vm.prank(operatorAddr);
        vm.expectRevert("Not operator");
        escrow.enterDeal(dealId, TRADER_A);
    }

    function test_multipleOperators() public {
        address op2 = address(0xCAFE);
        escrow.addOperator(op2);

        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Multi-op", 1000e6, 100e6);
        vm.prank(alice);
        escrow.depositFor(TRADER_A, 200e6);
        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);

        // Original operator enters for TRADER_A
        vm.prank(operatorAddr);
        escrow.enterDeal(dealId, TRADER_A);

        // Second operator enters for TRADER_B
        vm.prank(op2);
        escrow.enterDeal(dealId, TRADER_B);

        assertEq(escrow.getDeal(dealId).pendingEntries, 2);
    }

    // ========== Constructor Zero-Address ==========

    function test_constructor_revertsIfZeroUsdc() public {
        vm.expectRevert("Zero USDC");
        new MarginCallEscrow(address(0), address(registry), operatorAddr);
    }

    function test_constructor_revertsIfZeroRegistry() public {
        vm.expectRevert("Zero registry");
        new MarginCallEscrow(address(usdc), address(0), operatorAddr);
    }

    function test_constructor_revertsIfZeroOperator() public {
        vm.expectRevert("Zero operator");
        new MarginCallEscrow(address(usdc), address(registry), address(0));
    }
}
