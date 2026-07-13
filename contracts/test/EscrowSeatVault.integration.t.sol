// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MarginCallEscrow} from "../src/MarginCallEscrow.sol";
import {SeatVault} from "../src/SeatVault.sol";
import {MarginCallToken} from "../src/MarginCallToken.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";

/// @notice Real escrow + SeatVault: stake locks depositor rebind; grief paths.
contract EscrowSeatVaultIntegrationTest is Test {
    MarginCallEscrow public escrow;
    SeatVault public vault;
    MarginCallToken public blow;
    MockERC20 public usdc;
    MockIdentityRegistry public registry;

    address settlementOp = address(0xBEEF);
    address depositorBinder = address(0xB1DE);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    uint256 constant TRADER_A = 1;
    uint256 constant TRADER_B = 2;
    uint256 constant SEAT = 10_000e18;
    uint256 constant CORNER = 50_000e18;
    uint256 constant COOLDOWN = 1 days;

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        blow = new MarginCallToken();
        registry = new MockIdentityRegistry();
        escrow = new MarginCallEscrow(
            address(usdc),
            address(registry),
            settlementOp,
            depositorBinder,
            3600
        );
        vault = new SeatVault(address(escrow), address(blow), SEAT, CORNER, COOLDOWN);
        escrow.setSeatVault(address(vault));

        registry.setOwner(TRADER_A, alice);
        registry.setOwner(TRADER_B, bob);
        vm.prank(depositorBinder);
        escrow.setDepositor(TRADER_A, alice);
        vm.prank(depositorBinder);
        escrow.setDepositor(TRADER_B, bob);

        usdc.mint(alice, 1_000_000e6);
        usdc.mint(bob, 1_000_000e6);
        blow.mint(alice, 1_000_000e18);
        blow.mint(bob, 1_000_000e18);

        vm.prank(alice);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(alice);
        blow.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        blow.approve(address(vault), type(uint256).max);
    }

    function test_stakeLocksDepositorRebind() public {
        vm.prank(alice);
        vault.stake(TRADER_A, SEAT);
        assertTrue(vault.hasLockedPrincipal(TRADER_A));

        vm.prank(depositorBinder);
        vm.expectRevert("Depositor locked while vault principal");
        escrow.setDepositor(TRADER_A, bob);
    }

    function test_pendingUnstakeStillLocksDepositor() public {
        vm.prank(alice);
        vault.stake(TRADER_A, SEAT);
        vm.prank(alice);
        vault.initiateUnstake(TRADER_A, SEAT);

        vm.prank(depositorBinder);
        vm.expectRevert("Depositor locked while vault principal");
        escrow.setDepositor(TRADER_A, bob);

        vm.warp(block.timestamp + COOLDOWN);
        vault.completeUnstake(TRADER_A);

        // After full claim, rebind succeeds (no escrow balance).
        vm.prank(depositorBinder);
        escrow.setDepositor(TRADER_A, bob);
        assertEq(escrow.depositors(TRADER_A), bob);
    }

    function test_replacementDepositorCannotInitiateAfterRebindBlocked() public {
        vm.prank(alice);
        vault.stake(TRADER_A, SEAT);

        // Escrow balance also locks rebind independently.
        vm.prank(alice);
        escrow.depositFor(TRADER_A, 100e6);
        vm.prank(depositorBinder);
        vm.expectRevert("Depositor locked while balance > 0");
        escrow.setDepositor(TRADER_A, bob);

        // Withdraw balance but vault still locks.
        vm.prank(alice);
        escrow.withdraw(TRADER_A, 100e6);
        vm.prank(depositorBinder);
        vm.expectRevert("Depositor locked while vault principal");
        escrow.setDepositor(TRADER_A, bob);

        // Alice remains the only initiator.
        vm.prank(bob);
        vm.expectRevert("Not staker");
        vault.initiateUnstake(TRADER_A, 1e18);

        vm.prank(alice);
        vault.initiateUnstake(TRADER_A, SEAT);
        vm.warp(block.timestamp + COOLDOWN);
        vault.completeUnstake(TRADER_A);
        assertFalse(vault.hasLockedPrincipal(TRADER_A));
    }

    function test_escrowDealsStillWorkWithSeatVaultBound() public {
        vm.prank(alice);
        vault.stake(TRADER_A, CORNER);
        assertEq(uint8(vault.tierOf(TRADER_A)), uint8(SeatVault.Tier.CornerOffice));

        vm.prank(alice);
        uint256 dealId = escrow.createDeal("Integrated", 1000e6, 100e6);
        vm.prank(bob);
        escrow.depositFor(TRADER_B, 200e6);
        vm.prank(settlementOp);
        escrow.enterDeal(dealId, TRADER_B);
        vm.prank(settlementOp);
        escrow.settleEntry(dealId, TRADER_B, 100e6, 0);
        assertEq(escrow.getDeal(dealId).pendingEntries, 0);
    }
}
