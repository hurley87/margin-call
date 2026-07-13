// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SeatVault} from "../src/SeatVault.sol";
import {MarginCallToken} from "../src/MarginCallToken.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockEscrowDepositors} from "./mocks/MockEscrowDepositors.sol";
import {FeeOnTransferERC20} from "./mocks/FeeOnTransferERC20.sol";

contract SeatVaultTest is Test {
    SeatVault public vault;
    MarginCallToken public token;
    MockEscrowDepositors public escrow;

    address owner = address(this);
    address desk = makeAddr("desk");
    address otherDesk = makeAddr("otherDesk");
    address attacker = makeAddr("attacker");

    uint256 constant TRADER = 1;
    uint256 constant SEAT = 10_000e18;
    uint256 constant CORNER = 50_000e18;
    uint256 constant COOLDOWN = 1 days;

    function setUp() public {
        token = new MarginCallToken();
        escrow = new MockEscrowDepositors();
        vault = new SeatVault(address(escrow), address(token), SEAT, CORNER, COOLDOWN);

        escrow.setDepositor(TRADER, desk);

        _fundAndApprove(desk);
        _fundAndApprove(otherDesk);
        _fundAndApprove(attacker);
    }

    function _fundAndApprove(address who) internal {
        token.mint(who, 1_000_000e18);
        vm.prank(who);
        token.approve(address(vault), type(uint256).max);
    }

    function _stake(uint256 amount) internal {
        vm.prank(desk);
        vault.stake(TRADER, amount);
    }

    function _assertTier(SeatVault.Tier expected) internal view {
        assertEq(uint8(vault.tierOf(TRADER)), uint8(expected));
    }

    // ========== Stake auth ==========

    function test_stake_incrementsActive() public {
        _stake(5_000e18);
        SeatVault.StakeInfo memory info = vault.stakeOf(TRADER);
        assertEq(info.staker, desk);
        assertEq(info.active, 5_000e18);
        assertEq(vault.totalPrincipal(), 5_000e18);
    }

    function test_stake_repeatedIncrementsActive() public {
        _stake(3_000e18);
        _stake(2_000e18);
        SeatVault.StakeInfo memory info = vault.stakeOf(TRADER);
        assertEq(info.active, 5_000e18);
        assertEq(vault.totalPrincipal(), 5_000e18);
    }

    function test_stake_revertsZeroAmount() public {
        vm.prank(desk);
        vm.expectRevert("Zero amount");
        vault.stake(TRADER, 0);
    }

    function test_stake_revertsUnauthorized() public {
        vm.prank(attacker);
        vm.expectRevert("Not depositor");
        vault.stake(TRADER, 1e18);
    }

    function test_stake_revertsZeroDepositor() public {
        vm.prank(desk);
        vm.expectRevert("Zero depositor");
        vault.stake(99, 1e18);
    }

    function test_stake_revertsForeignPrincipal() public {
        _stake(1_000e18);
        escrow.setDepositor(TRADER, otherDesk);
        vm.prank(otherDesk);
        vm.expectRevert("Foreign principal");
        vault.stake(TRADER, 1e18);
    }

    // ========== Tier boundaries ==========

    function test_tierOf_galleryBelowSeat() public {
        _stake(9_999e18);
        _assertTier(SeatVault.Tier.Gallery);
    }

    function test_tierOf_seatAtThreshold() public {
        _stake(10_000e18);
        _assertTier(SeatVault.Tier.Seat);
    }

    function test_tierOf_seatBelowCorner() public {
        _stake(49_999e18);
        _assertTier(SeatVault.Tier.Seat);
    }

    function test_tierOf_cornerAtThreshold() public {
        _stake(50_000e18);
        _assertTier(SeatVault.Tier.CornerOffice);
    }

    function test_tierOf_galleryOnDepositorChange() public {
        _stake(50_000e18);
        escrow.setDepositor(TRADER, otherDesk);
        _assertTier(SeatVault.Tier.Gallery);
    }

    // ========== Unstake flow ==========

    function test_initiateUnstake_dropsTierImmediately() public {
        _stake(50_000e18);
        _assertTier(SeatVault.Tier.CornerOffice);

        vm.prank(desk);
        vault.initiateUnstake(TRADER, 1e18);

        _assertTier(SeatVault.Tier.Seat);
    }

    function test_initiateUnstake_revertsOverUnstake() public {
        _stake(1_000e18);
        vm.prank(desk);
        vm.expectRevert("Over unstake");
        vault.initiateUnstake(TRADER, 1_001e18);
    }

    function test_completeUnstake_revertsBeforeCooldown() public {
        _stake(1_000e18);
        vm.prank(desk);
        vault.initiateUnstake(TRADER, 500e18);

        vm.expectRevert("Cooldown active");
        vault.completeUnstake(TRADER);
    }

    function test_completeUnstake_transfersExactPending() public {
        _stake(1_000e18);
        vm.prank(desk);
        vault.initiateUnstake(TRADER, 400e18);

        uint256 before = token.balanceOf(desk);
        vm.warp(block.timestamp + COOLDOWN);
        vault.completeUnstake(TRADER);

        assertEq(token.balanceOf(desk) - before, 400e18);
        SeatVault.StakeInfo memory info = vault.stakeOf(TRADER);
        assertEq(info.pending, 0);
        assertEq(info.active, 600e18);
        assertEq(vault.totalPrincipal(), 600e18);
    }

    function test_completeUnstake_clearsStakerWhenFullyWithdrawn() public {
        _stake(1_000e18);
        vm.prank(desk);
        vault.initiateUnstake(TRADER, 1_000e18);

        vm.warp(block.timestamp + COOLDOWN);
        vault.completeUnstake(TRADER);

        SeatVault.StakeInfo memory info = vault.stakeOf(TRADER);
        assertEq(info.staker, address(0));
        assertEq(vault.totalPrincipal(), 0);
    }

    function test_formerStakerCanUnstakeAfterDepositorChange() public {
        _stake(5_000e18);
        escrow.setDepositor(TRADER, otherDesk);

        vm.prank(desk);
        vault.initiateUnstake(TRADER, 5_000e18);

        vm.warp(block.timestamp + COOLDOWN);
        vault.completeUnstake(TRADER);

        assertEq(token.balanceOf(desk), 1_000_000e18);
        assertEq(vault.totalPrincipal(), 0);
    }

    // ========== setPolicy ==========

    function test_setPolicy_revertsNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert("Not owner");
        vault.setPolicy(SEAT, CORNER, COOLDOWN);
    }

    function test_setPolicy_revertsCornerBelowSeat() public {
        vm.expectRevert("Corner below seat");
        vault.setPolicy(CORNER, SEAT, COOLDOWN);
    }

    function test_setPolicy_lowersThresholdPromotesTier() public {
        _stake(8_000e18);
        _assertTier(SeatVault.Tier.Gallery);

        vault.setPolicy(8_000e18, CORNER, COOLDOWN);
        _assertTier(SeatVault.Tier.Seat);
    }

    function test_replacementDepositorCannotInitiateUnstake() public {
        _stake(5_000e18);
        escrow.setDepositor(TRADER, otherDesk);

        vm.prank(otherDesk);
        vm.expectRevert("Not staker");
        vault.initiateUnstake(TRADER, 1_000e18);
    }

    function test_repeatedInitiateDoesNotExtendCooldown() public {
        _stake(1_000e18);

        vm.prank(desk);
        vault.initiateUnstake(TRADER, 100e18);
        uint256 unlockAfterFirst = vault.stakeOf(TRADER).unlockTime;

        vm.warp(block.timestamp + 1 hours);

        vm.prank(desk);
        vault.initiateUnstake(TRADER, 50e18);
        uint256 unlockAfterSecond = vault.stakeOf(TRADER).unlockTime;

        assertEq(unlockAfterSecond, unlockAfterFirst);
    }

    function test_setPolicy_newCooldownDoesNotAffectExistingPending() public {
        _stake(1_000e18);

        vm.prank(desk);
        vault.initiateUnstake(TRADER, 100e18);
        uint256 unlockAfterFirst = vault.stakeOf(TRADER).unlockTime;

        vault.setPolicy(SEAT, CORNER, 2 days);

        assertEq(vault.stakeOf(TRADER).unlockTime, unlockAfterFirst);

        vm.warp(block.timestamp + 1 hours);
        vm.prank(desk);
        vault.initiateUnstake(TRADER, 50e18);

        assertEq(vault.stakeOf(TRADER).unlockTime, unlockAfterFirst);
    }

    // ========== Pause ==========

    function test_pause_blocksStake() public {
        vault.pause();

        vm.prank(desk);
        vm.expectRevert("Paused");
        vault.stake(TRADER, 1_000e18);
    }

    function test_pause_blocksInitiate() public {
        _stake(1_000e18);
        vault.pause();

        vm.prank(desk);
        vm.expectRevert("Paused");
        vault.initiateUnstake(TRADER, 500e18);
    }

    function test_pause_allowsMaturedClaim() public {
        _stake(1_000e18);
        vm.prank(desk);
        vault.initiateUnstake(TRADER, 400e18);

        vm.warp(block.timestamp + COOLDOWN);
        vault.pause();

        uint256 before = token.balanceOf(desk);
        vault.completeUnstake(TRADER);
        assertEq(token.balanceOf(desk) - before, 400e18);
    }

    function test_pause_onlyPauserOrOwner() public {
        vm.prank(attacker);
        vm.expectRevert("Not pauser");
        vault.pause();

        address pauserAddr = makeAddr("pauser");
        vault.setPauser(pauserAddr);
        vm.prank(pauserAddr);
        vault.pause();
        assertTrue(vault.paused());
    }

    // ========== hasLockedPrincipal ==========

    function test_hasLockedPrincipal() public {
        assertFalse(vault.hasLockedPrincipal(TRADER));

        _stake(1_000e18);
        assertTrue(vault.hasLockedPrincipal(TRADER));

        vm.prank(desk);
        vault.initiateUnstake(TRADER, 400e18);
        assertTrue(vault.hasLockedPrincipal(TRADER));

        vm.warp(block.timestamp + COOLDOWN);
        vault.completeUnstake(TRADER);
        assertTrue(vault.hasLockedPrincipal(TRADER));

        vm.prank(desk);
        vault.initiateUnstake(TRADER, 600e18);
        vm.warp(block.timestamp + COOLDOWN);
        vault.completeUnstake(TRADER);
        assertFalse(vault.hasLockedPrincipal(TRADER));
    }

    function test_setPolicy_newCooldownAffectsNewInitiatesOnly() public {
        _stake(1_000e18);

        vm.prank(desk);
        vault.initiateUnstake(TRADER, 100e18);
        uint256 unlockAfterFirst = vault.stakeOf(TRADER).unlockTime;

        vm.warp(block.timestamp + COOLDOWN);
        vault.completeUnstake(TRADER);

        vault.setPolicy(SEAT, CORNER, 2 days);

        vm.prank(desk);
        vault.initiateUnstake(TRADER, 50e18);
        uint256 unlockAfterSecond = vault.stakeOf(TRADER).unlockTime;

        assertGe(unlockAfterSecond, block.timestamp + 2 days);
        assertGt(unlockAfterSecond, unlockAfterFirst);
    }

    // ========== setToken ==========

    function test_setToken_whenEmpty() public {
        MarginCallToken newToken = new MarginCallToken();
        vault.setToken(address(newToken));
        assertEq(address(vault.token()), address(newToken));
    }

    function test_setToken_revertsWithPrincipal() public {
        _stake(1e18);
        MarginCallToken newToken = new MarginCallToken();
        vm.expectRevert("Principal outstanding");
        vault.setToken(address(newToken));
    }

    function test_setToken_revertsNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert("Not owner");
        vault.setToken(address(token));
    }

    function test_setToken_revertsZeroAddress() public {
        vm.expectRevert("Zero token");
        vault.setToken(address(0));
    }

    function test_stakeAfterSetTokenUsesNewToken() public {
        MarginCallToken newToken = new MarginCallToken();
        vault.setToken(address(newToken));

        newToken.mint(desk, 1_000e18);
        vm.prank(desk);
        newToken.approve(address(vault), type(uint256).max);

        vm.prank(desk);
        vault.stake(TRADER, 500e18);

        assertEq(newToken.balanceOf(address(vault)), 500e18);
    }

    // ========== Fee-on-transfer ==========

    function test_stake_feeOnTransferCreditsDelta() public {
        FeeOnTransferERC20 feeToken = new FeeOnTransferERC20("Fee", "FEE");
        vault.setToken(address(feeToken));

        feeToken.mint(desk, 100_000e18);
        vm.prank(desk);
        feeToken.approve(address(vault), type(uint256).max);

        vm.prank(desk);
        vault.stake(TRADER, 10_000e18);

        SeatVault.StakeInfo memory info = vault.stakeOf(TRADER);
        assertEq(info.active, 9_900e18);
        assertEq(feeToken.balanceOf(address(vault)), 9_900e18);
    }

    // ========== Ownership ==========

    function test_ownershipTwoStep() public {
        address newOwner = makeAddr("newOwner");
        vault.transferOwnership(newOwner);
        vm.prank(newOwner);
        vault.acceptOwnership();
        assertEq(vault.owner(), newOwner);
    }

    // ========== Principal conservation ==========

    function test_principalConservation() public {
        _stake(20_000e18);
        vm.prank(desk);
        vault.initiateUnstake(TRADER, 5_000e18);
        vm.prank(desk);
        vault.initiateUnstake(TRADER, 3_000e18);

        SeatVault.StakeInfo memory info = vault.stakeOf(TRADER);
        assertEq(info.active + info.pending, 20_000e18);
        assertEq(vault.totalPrincipal(), 20_000e18);

        vm.warp(block.timestamp + COOLDOWN);
        vault.completeUnstake(TRADER);

        info = vault.stakeOf(TRADER);
        assertEq(info.pending, 0);
        assertEq(info.active, 12_000e18);
        assertEq(vault.totalPrincipal(), 12_000e18);
        assertEq(token.balanceOf(address(vault)), 12_000e18);
    }

    // ========== Constructor / initiate gaps (issue #207) ==========

    function test_constructor_revertsZeroEscrow() public {
        vm.expectRevert("Zero escrow");
        new SeatVault(address(0), address(token), SEAT, CORNER, COOLDOWN);
    }

    function test_constructor_revertsZeroToken() public {
        vm.expectRevert("Zero token");
        new SeatVault(address(escrow), address(0), SEAT, CORNER, COOLDOWN);
    }

    function test_constructor_revertsCornerBelowSeat() public {
        vm.expectRevert("Corner below seat");
        new SeatVault(address(escrow), address(token), CORNER, SEAT, COOLDOWN);
    }

    function test_initiateUnstake_revertsZeroAmount() public {
        _stake(1_000e18);
        vm.prank(desk);
        vm.expectRevert("Zero amount");
        vault.initiateUnstake(TRADER, 0);
    }
}

contract SeatVaultReentrancyTest is Test {
    function test_completeUnstake_reentrancySafe() public {
        ReentrantToken reentrant = new ReentrantToken();
        MockEscrowDepositors escrow = new MockEscrowDepositors();
        SeatVault vault = new SeatVault(address(escrow), address(reentrant), 10_000e18, 50_000e18, 0);

        address desk = makeAddr("desk");
        escrow.setDepositor(1, desk);
        reentrant.mint(desk, 1_000e18);
        reentrant.setVault(vault);

        vm.startPrank(desk);
        reentrant.approve(address(vault), type(uint256).max);
        vault.stake(1, 100e18);
        vault.initiateUnstake(1, 100e18);
        vm.stopPrank();

        uint256 deskBefore = reentrant.balanceOf(desk);
        vault.completeUnstake(1);

        assertEq(reentrant.balanceOf(desk) - deskBefore, 100e18);
        assertEq(reentrant.balanceOf(address(vault)), 0);
        assertEq(vault.totalPrincipal(), 0);
    }
}

contract ReentrantToken is MockERC20 {
    SeatVault public vaultTarget;

    constructor() MockERC20("Reentrant", "REENT", 18) {}

    function setVault(SeatVault vault_) external {
        vaultTarget = vault_;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (address(vaultTarget) != address(0) && to != address(vaultTarget)) {
            try vaultTarget.completeUnstake(1) {} catch {}
        }
        return super.transfer(to, amount);
    }
}
