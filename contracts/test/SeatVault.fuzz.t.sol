// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SeatVault} from "../src/SeatVault.sol";
import {MarginCallToken} from "../src/MarginCallToken.sol";
import {MockEscrowDepositors} from "./mocks/MockEscrowDepositors.sol";

/// @notice Fuzz stake / unstake amounts and cooldown non-extension (#204/#207).
contract SeatVaultFuzzTest is Test {
    SeatVault public vault;
    MarginCallToken public token;
    MockEscrowDepositors public escrow;

    address desk = makeAddr("desk");
    address otherDesk = makeAddr("otherDesk");

    uint256 constant TRADER = 1;
    uint256 constant SEAT = 10_000e18;
    uint256 constant CORNER = 50_000e18;
    uint256 constant COOLDOWN = 1 days;

    function setUp() public {
        token = new MarginCallToken();
        escrow = new MockEscrowDepositors();
        vault = new SeatVault(address(escrow), address(token), SEAT, CORNER, COOLDOWN);
        escrow.setDepositor(TRADER, desk);

        token.mint(desk, 10_000_000e18);
        token.mint(otherDesk, 10_000_000e18);
        vm.prank(desk);
        token.approve(address(vault), type(uint256).max);
        vm.prank(otherDesk);
        token.approve(address(vault), type(uint256).max);
    }

    function testFuzz_stakeAndPartialUnstake(uint256 stakeAmt, uint256 unstakeAmt) public {
        stakeAmt = bound(stakeAmt, 1, 1_000_000e18);
        unstakeAmt = bound(unstakeAmt, 1, stakeAmt);

        vm.prank(desk);
        vault.stake(TRADER, stakeAmt);

        vm.prank(desk);
        vault.initiateUnstake(TRADER, unstakeAmt);

        SeatVault.StakeInfo memory info = vault.stakeOf(TRADER);
        assertEq(info.active, stakeAmt - unstakeAmt);
        assertEq(info.pending, unstakeAmt);
        assertEq(vault.totalPrincipal(), stakeAmt);
        assertEq(token.balanceOf(address(vault)), stakeAmt);

        uint256 unlock = info.unlockTime;
        // Second initiate must not extend unlock.
        if (info.active > 0) {
            uint256 second = bound(unstakeAmt, 1, info.active);
            vm.prank(desk);
            vault.initiateUnstake(TRADER, second);
            assertEq(vault.stakeOf(TRADER).unlockTime, unlock);
        }

        vm.warp(unlock);
        vault.completeUnstake(TRADER);
        info = vault.stakeOf(TRADER);
        assertEq(info.pending, 0);
        assertEq(vault.totalPrincipal(), info.active);
        assertEq(token.balanceOf(address(vault)), info.active);
    }

    function testFuzz_replacementDepositorCannotInitiate(uint256 stakeAmt, uint256 unstakeAmt)
        public
    {
        stakeAmt = bound(stakeAmt, 1, 100_000e18);
        unstakeAmt = bound(unstakeAmt, 1, stakeAmt);

        vm.prank(desk);
        vault.stake(TRADER, stakeAmt);

        escrow.setDepositor(TRADER, otherDesk);

        vm.prank(otherDesk);
        vm.expectRevert("Not staker");
        vault.initiateUnstake(TRADER, unstakeAmt);

        // Original staker can still initiate / claim.
        vm.prank(desk);
        vault.initiateUnstake(TRADER, unstakeAmt);
        vm.warp(block.timestamp + COOLDOWN);
        vault.completeUnstake(TRADER);
    }

    function testFuzz_tierBoundaries(uint256 activeAmt) public {
        activeAmt = bound(activeAmt, 1, CORNER * 2);
        vm.prank(desk);
        vault.stake(TRADER, activeAmt);

        SeatVault.Tier tier = vault.tierOf(TRADER);
        if (activeAmt >= CORNER) {
            assertEq(uint8(tier), uint8(SeatVault.Tier.CornerOffice));
        } else if (activeAmt >= SEAT) {
            assertEq(uint8(tier), uint8(SeatVault.Tier.Seat));
        } else {
            assertEq(uint8(tier), uint8(SeatVault.Tier.Gallery));
        }
    }
}
