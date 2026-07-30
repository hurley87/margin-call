// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {GameToken} from "../src/GameToken.sol";

contract GameTokenTest is Test {
    GameToken public token;

    address admin = makeAddr("admin");
    address treasury = makeAddr("treasury");
    address distributor = makeAddr("distributor");
    address claimant = makeAddr("claimant");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address stranger = makeAddr("stranger");

    uint256 constant SUPPLY = 1_000_000_000e18;

    /// @dev Read once in `setUp`: a getter call inside a pranked call would consume the prank.
    bytes32 distributorRole;

    function setUp() public {
        token = new GameToken(admin, treasury, SUPPLY);
        distributorRole = token.DISTRIBUTOR_ROLE();
        vm.prank(admin);
        token.grantRole(distributorRole, distributor);
    }

    // ========== Labelling and metadata ==========

    function test_nameAndSymbolLabelledAsTestAsset() public view {
        assertEq(token.name(), "Margin Call Game Token (Test Asset)");
        assertEq(token.symbol(), "MCGT");
    }

    function test_isTestAssetConstant() public view {
        assertTrue(token.IS_TEST_ASSET());
        assertGt(bytes(token.TEST_ASSET_NOTICE()).length, 0);
    }

    function test_decimalsAreEighteen() public view {
        assertEq(token.decimals(), 18);
    }

    // ========== Fixed supply, minted once to the treasury ==========

    function test_wholeSupplyMintedToTreasury() public view {
        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.balanceOf(treasury), SUPPLY);
        assertEq(token.treasury(), treasury);
    }

    function test_noMintAuthorityExists() public view {
        // DEFAULT_ADMIN_ROLE and DISTRIBUTOR_ROLE are the only roles; neither mints.
        assertTrue(token.hasRole(token.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(token.hasRole(token.DISTRIBUTOR_ROLE(), distributor));
        assertFalse(token.hasRole(token.DISTRIBUTOR_ROLE(), admin));
    }

    function test_supplyUnchangedByFundingAndClaims() public {
        vm.prank(treasury);
        token.transfer(distributor, 300_000_000e18);

        vm.prank(distributor);
        token.transfer(claimant, 5e18);

        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.balanceOf(treasury) + token.balanceOf(distributor) + token.balanceOf(claimant), SUPPLY);
    }

    function test_constructorRejectsZeroAdmin() public {
        vm.expectRevert(GameToken.ZeroAddress.selector);
        new GameToken(address(0), treasury, SUPPLY);
    }

    function test_constructorRejectsZeroTreasury() public {
        vm.expectRevert(GameToken.ZeroAddress.selector);
        new GameToken(admin, address(0), SUPPLY);
    }

    function test_constructorRejectsZeroSupply() public {
        vm.expectRevert(GameToken.ZeroSupply.selector);
        new GameToken(admin, treasury, 0);
    }

    // ========== Transfer lock fails closed ==========

    function test_userToUserTransferFailsClosed() public {
        vm.prank(treasury);
        token.transfer(distributor, 100e18);
        vm.prank(distributor);
        token.transfer(alice, 10e18);

        vm.expectRevert(abi.encodeWithSelector(GameToken.TransfersLocked.selector, alice, bob));
        vm.prank(alice);
        token.transfer(bob, 1e18);
    }

    function test_treasuryCannotTransferToUser() public {
        vm.expectRevert(abi.encodeWithSelector(GameToken.TransfersLocked.selector, treasury, alice));
        vm.prank(treasury);
        token.transfer(alice, 1e18);
    }

    function test_transferFromAlsoFailsClosed() public {
        vm.prank(treasury);
        token.transfer(distributor, 100e18);
        vm.prank(distributor);
        token.transfer(alice, 10e18);

        vm.prank(alice);
        token.approve(bob, 10e18);

        vm.expectRevert(abi.encodeWithSelector(GameToken.TransfersLocked.selector, alice, bob));
        vm.prank(bob);
        token.transferFrom(alice, bob, 1e18);
    }

    function test_approvalStillWorksWhileLocked() public {
        vm.prank(alice);
        token.approve(bob, 7e18);
        assertEq(token.allowance(alice, bob), 7e18);
    }

    function test_lockedTransferDoesNotMoveBalances() public {
        uint256 before = token.balanceOf(treasury);

        vm.expectRevert(abi.encodeWithSelector(GameToken.TransfersLocked.selector, treasury, alice));
        vm.prank(treasury);
        token.transfer(alice, 1e18);

        assertEq(token.balanceOf(treasury), before);
        assertEq(token.balanceOf(alice), 0);
    }

    // ========== Distributor exemptions ==========

    function test_distributorToClaimantExempt() public {
        vm.prank(treasury);
        token.transfer(distributor, 100e18);

        vm.prank(distributor);
        token.transfer(claimant, 40e18);

        assertEq(token.balanceOf(claimant), 40e18);
    }

    function test_treasuryCanFundTheDistributor() public {
        vm.prank(treasury);
        token.transfer(distributor, 300_000_000e18);

        assertEq(token.balanceOf(distributor), 300_000_000e18);
        assertEq(token.balanceOf(treasury), SUPPLY - 300_000_000e18);
    }

    /// @dev A claimant sending into the Distributor could never get those tokens back, since
    ///      `sweep` cannot touch the game token. Fail the transfer instead of burning their funds.
    function test_nonTreasuryCannotSendIntoTheDistributor() public {
        vm.prank(treasury);
        token.transfer(distributor, 100e18);
        vm.prank(distributor);
        token.transfer(alice, 10e18);

        vm.expectRevert(abi.encodeWithSelector(GameToken.TransfersLocked.selector, alice, distributor));
        vm.prank(alice);
        token.transfer(distributor, 1e18);

        assertEq(token.balanceOf(alice), 10e18);
    }

    function test_revokingDistributorRoleRelocksThatAddress() public {
        vm.prank(treasury);
        token.transfer(distributor, 100e18);

        vm.prank(admin);
        token.revokeRole(distributorRole, distributor);

        vm.expectRevert(abi.encodeWithSelector(GameToken.TransfersLocked.selector, distributor, claimant));
        vm.prank(distributor);
        token.transfer(claimant, 1e18);
    }

    function test_onlyAdminGrantsDistributorRole() public {
        bytes32 role = token.DEFAULT_ADMIN_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        vm.prank(stranger);
        token.grantRole(distributorRole, stranger);
    }

    function test_isTransferAllowedReflectsExemptions() public view {
        assertFalse(token.isTransferAllowed(alice, bob));
        assertTrue(token.isTransferAllowed(distributor, alice));
        assertTrue(token.isTransferAllowed(treasury, distributor));
        assertFalse(token.isTransferAllowed(alice, distributor));
        assertFalse(token.isTransferAllowed(treasury, alice));
    }

    // ========== One-way timelocked enable switch ==========

    function test_transfersStartDisabled() public view {
        assertFalse(token.transfersEnabled());
        assertEq(token.transferEnableEta(), 0);
    }

    function test_scheduleSetsEtaAndEmits() public {
        uint256 expected = block.timestamp + token.TRANSFER_ENABLE_DELAY();

        vm.expectEmit(false, false, false, true, address(token));
        emit GameToken.TransferEnableScheduled(expected);
        vm.prank(admin);
        uint256 eta = token.scheduleTransferEnable();

        assertEq(eta, expected);
        assertEq(token.transferEnableEta(), expected);
        assertFalse(token.transfersEnabled());
    }

    function test_scheduleTwiceReverts() public {
        vm.prank(admin);
        uint256 eta = token.scheduleTransferEnable();

        vm.expectRevert(abi.encodeWithSelector(GameToken.TransferEnableAlreadyScheduled.selector, eta));
        vm.prank(admin);
        token.scheduleTransferEnable();
    }

    function test_scheduleSetsAnExecutionWindow() public {
        vm.prank(admin);
        uint256 eta = token.scheduleTransferEnable();

        assertEq(token.transferEnableDeadline(), eta + token.TRANSFER_ENABLE_WINDOW());
        assertTrue(token.isTransferEnableScheduled());
    }

    function test_enableAtTheWindowDeadlineStillWorks() public {
        vm.prank(admin);
        uint256 eta = token.scheduleTransferEnable();

        vm.warp(eta + token.TRANSFER_ENABLE_WINDOW());
        vm.prank(admin);
        token.enableTransfers();

        assertTrue(token.transfersEnabled());
    }

    /// @dev Without an expiry, an admin could arm the switch, sit on it for a year, and unlock in
    ///      the next block with no recent warning — the notice period would buy holders nothing.
    function test_unexercisedScheduleExpires() public {
        vm.prank(admin);
        uint256 eta = token.scheduleTransferEnable();
        uint256 deadline = eta + token.TRANSFER_ENABLE_WINDOW();

        vm.warp(deadline + 1);
        assertFalse(token.isTransferEnableScheduled());

        vm.expectRevert(abi.encodeWithSelector(GameToken.TransferEnableExpired.selector, deadline, block.timestamp));
        vm.prank(admin);
        token.enableTransfers();

        assertFalse(token.transfersEnabled());
    }

    function test_expiredScheduleMustBeRearmedAndServesFreshNotice() public {
        vm.prank(admin);
        uint256 firstEta = token.scheduleTransferEnable();

        vm.warp(firstEta + token.TRANSFER_ENABLE_WINDOW() + 365 days);

        vm.prank(admin);
        uint256 secondEta = token.scheduleTransferEnable();
        assertEq(secondEta, block.timestamp + token.TRANSFER_ENABLE_DELAY());

        // The re-armed schedule serves the full delay again — no instant unlock.
        vm.expectRevert(abi.encodeWithSelector(GameToken.TransferEnableNotElapsed.selector, secondEta, block.timestamp));
        vm.prank(admin);
        token.enableTransfers();

        vm.warp(secondEta);
        vm.prank(admin);
        token.enableTransfers();
        assertTrue(token.transfersEnabled());
    }

    function test_liveScheduleCannotBeRearmedToResetTheClock() public {
        vm.prank(admin);
        uint256 eta = token.scheduleTransferEnable();

        // Anywhere inside the notice period or the execution window, re-arming is refused.
        vm.warp(eta - 1);
        vm.expectRevert(abi.encodeWithSelector(GameToken.TransferEnableAlreadyScheduled.selector, eta));
        vm.prank(admin);
        token.scheduleTransferEnable();

        vm.warp(eta + token.TRANSFER_ENABLE_WINDOW());
        vm.expectRevert(abi.encodeWithSelector(GameToken.TransferEnableAlreadyScheduled.selector, eta));
        vm.prank(admin);
        token.scheduleTransferEnable();
    }

    function test_scheduleRequiresAdmin() public {
        bytes32 role = token.DEFAULT_ADMIN_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        vm.prank(stranger);
        token.scheduleTransferEnable();
    }

    function test_enableWithoutScheduleReverts() public {
        vm.expectRevert(GameToken.TransferEnableNotScheduled.selector);
        vm.prank(admin);
        token.enableTransfers();
    }

    function test_enableBeforeEtaReverts() public {
        vm.prank(admin);
        uint256 eta = token.scheduleTransferEnable();

        vm.warp(eta - 1);
        vm.expectRevert(abi.encodeWithSelector(GameToken.TransferEnableNotElapsed.selector, eta, block.timestamp));
        vm.prank(admin);
        token.enableTransfers();

        assertFalse(token.transfersEnabled());
    }

    function test_enableAtEtaUnlocksUserToUser() public {
        vm.prank(treasury);
        token.transfer(distributor, 100e18);
        vm.prank(distributor);
        token.transfer(alice, 10e18);

        vm.prank(admin);
        uint256 eta = token.scheduleTransferEnable();
        vm.warp(eta);

        vm.expectEmit(false, false, false, true, address(token));
        emit GameToken.TransfersEnabled(block.timestamp);
        vm.prank(admin);
        token.enableTransfers();

        assertTrue(token.transfersEnabled());

        vm.prank(alice);
        token.transfer(bob, 4e18);
        assertEq(token.balanceOf(bob), 4e18);
    }

    function test_enableRequiresAdmin() public {
        vm.prank(admin);
        uint256 eta = token.scheduleTransferEnable();
        vm.warp(eta);

        bytes32 role = token.DEFAULT_ADMIN_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        vm.prank(stranger);
        token.enableTransfers();
    }

    function test_enableIsOneWay() public {
        _enableTransfers();

        vm.expectRevert(GameToken.TransfersAlreadyEnabled.selector);
        vm.prank(admin);
        token.enableTransfers();

        vm.expectRevert(GameToken.TransfersAlreadyEnabled.selector);
        vm.prank(admin);
        token.scheduleTransferEnable();

        // Revoking the Distributor exemption cannot re-lock the token.
        vm.prank(admin);
        token.revokeRole(distributorRole, distributor);
        assertTrue(token.transfersEnabled());
        assertTrue(token.isTransferAllowed(alice, bob));
    }

    function test_enabledTokenStillEnforcesBalances() public {
        _enableTransfers();

        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, alice, 0, 1e18));
        vm.prank(alice);
        token.transfer(bob, 1e18);
    }

    function _enableTransfers() internal {
        vm.prank(admin);
        uint256 eta = token.scheduleTransferEnable();
        vm.warp(eta);
        vm.prank(admin);
        token.enableTransfers();
    }
}
