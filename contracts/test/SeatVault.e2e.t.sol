// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SeatVault} from "../src/SeatVault.sol";
import {MarginCallToken} from "../src/MarginCallToken.sol";
import {MockEscrowDepositors} from "./mocks/MockEscrowDepositors.sol";

/// @notice Full stake → tier → unstake → claim flow.
contract SeatVaultE2ETest is Test {
    SeatVault public vault;
    MarginCallToken public token;
    MockEscrowDepositors public escrow;

    address desk = makeAddr("desk");
    uint256 constant TRADER = 1;
    uint256 constant SEAT = 10_000e18;
    uint256 constant CORNER = 50_000e18;
    uint256 constant COOLDOWN = 1 days;

    function setUp() public {
        token = new MarginCallToken();
        escrow = new MockEscrowDepositors();
        vault = new SeatVault(address(escrow), address(token), SEAT, CORNER, COOLDOWN);
        escrow.setDepositor(TRADER, desk);
        token.mint(desk, 1_000_000e18);
        vm.prank(desk);
        token.approve(address(vault), type(uint256).max);
    }

    function test_e2e_stakeTierUnstakeClaim() public {
        // Below seat → Gallery.
        vm.prank(desk);
        vault.stake(TRADER, 5_000e18);
        assertEq(uint8(vault.tierOf(TRADER)), uint8(SeatVault.Tier.Gallery));
        assertTrue(vault.hasLockedPrincipal(TRADER));

        // Reach Seat.
        vm.prank(desk);
        vault.stake(TRADER, 5_000e18);
        assertEq(uint8(vault.tierOf(TRADER)), uint8(SeatVault.Tier.Seat));

        // Reach Corner Office.
        vm.prank(desk);
        vault.stake(TRADER, 40_000e18);
        assertEq(uint8(vault.tierOf(TRADER)), uint8(SeatVault.Tier.CornerOffice));
        assertEq(vault.totalPrincipal(), 50_000e18);

        // Partial unstake → back to Seat while pending.
        vm.prank(desk);
        vault.initiateUnstake(TRADER, 40_000e18);
        assertEq(uint8(vault.tierOf(TRADER)), uint8(SeatVault.Tier.Seat));
        SeatVault.StakeInfo memory info = vault.stakeOf(TRADER);
        assertEq(info.active, 10_000e18);
        assertEq(info.pending, 40_000e18);

        // Capacity-relevant principal still locked until claim.
        assertTrue(vault.hasLockedPrincipal(TRADER));

        uint256 deskBefore = token.balanceOf(desk);
        vm.warp(block.timestamp + COOLDOWN);
        vault.completeUnstake(TRADER);

        assertEq(token.balanceOf(desk), deskBefore + 40_000e18);
        assertEq(vault.totalPrincipal(), 10_000e18);
        assertEq(uint8(vault.tierOf(TRADER)), uint8(SeatVault.Tier.Seat));

        // Full exit.
        vm.prank(desk);
        vault.initiateUnstake(TRADER, 10_000e18);
        vm.warp(block.timestamp + COOLDOWN);
        vault.completeUnstake(TRADER);

        assertEq(vault.totalPrincipal(), 0);
        assertFalse(vault.hasLockedPrincipal(TRADER));
        assertEq(uint8(vault.tierOf(TRADER)), uint8(SeatVault.Tier.Gallery));
        assertEq(token.balanceOf(address(vault)), 0);
    }
}
