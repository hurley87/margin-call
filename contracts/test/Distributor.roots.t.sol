// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Test} from "forge-std/Test.sol";
import {Distributor} from "../src/Distributor.sol";
import {DistributorFixture} from "./helpers/DistributorFixture.sol";

contract DistributorRootsTest is Test, DistributorFixture {
    bytes32 constant ROOT = keccak256("root");
    bytes32 constant OTHER_ROOT = keccak256("other-root");

    // ========== Wiring and defaults ==========

    function test_constructorWiresTokenAndEpochZero() public view {
        assertEq(address(distributor.gameToken()), address(token));
        assertEq(distributor.epochZeroStart(), block.timestamp);
        assertEq(distributor.currentEpoch(), 0);
        assertTrue(distributor.hasRole(distributor.DEFAULT_ADMIN_ROLE(), admin));
    }

    function test_constructorRejectsZeroAddresses() public {
        vm.expectRevert(Distributor.ZeroAddress.selector);
        new Distributor(address(0), address(token));

        vm.expectRevert(Distributor.ZeroAddress.selector);
        new Distributor(admin, address(0));
    }

    function test_ratesStartAtZeroWithPrdRebateCap() public view {
        assertEq(distributor.makerRatePerEpoch(), 0);
        assertEq(distributor.takerPotPerEpoch(), 0);
        assertEq(distributor.rebatePerRipCap(), WAD / 10);
    }

    function test_fundedByPlainTransfer() public view {
        assertEq(distributor.fundedBalance(), FUNDED);
        assertEq(token.balanceOf(address(distributor)), FUNDED);
    }

    function test_epochMathIsDaily() public view {
        assertEq(distributor.EPOCH_DURATION(), 1 days);
        assertEq(distributor.epochStart(0), distributor.epochZeroStart());
        assertEq(distributor.epochStart(3), distributor.epochZeroStart() + 3 days);
    }

    function test_currentEpochAdvancesDaily() public {
        vm.warp(distributor.epochZeroStart() + 1 days - 1);
        assertEq(distributor.currentEpoch(), 0);

        vm.warp(distributor.epochZeroStart() + 1 days);
        assertEq(distributor.currentEpoch(), 1);

        vm.warp(distributor.epochZeroStart() + 10 days + 5 hours);
        assertEq(distributor.currentEpoch(), 10);
    }

    // ========== Owner rate setters ==========

    function test_setMakerRatePerEpoch() public {
        vm.expectEmit(false, false, false, true, address(distributor));
        emit Distributor.MakerRatePerEpochSet(42e18);
        vm.prank(admin);
        distributor.setMakerRatePerEpoch(42e18);

        assertEq(distributor.makerRatePerEpoch(), 42e18);
    }

    function test_setTakerPotPerEpoch() public {
        vm.expectEmit(false, false, false, true, address(distributor));
        emit Distributor.TakerPotPerEpochSet(1_000e18);
        vm.prank(admin);
        distributor.setTakerPotPerEpoch(1_000e18);

        assertEq(distributor.takerPotPerEpoch(), 1_000e18);
    }

    function test_setRebatePerRipCap() public {
        vm.expectEmit(false, false, false, true, address(distributor));
        emit Distributor.RebatePerRipCapSet(WAD / 4);
        vm.prank(admin);
        distributor.setRebatePerRipCap(WAD / 4);

        assertEq(distributor.rebatePerRipCap(), WAD / 4);
    }

    function test_setRebatePerRipCapRejectsAboveOne() public {
        vm.expectRevert(abi.encodeWithSelector(Distributor.RatioTooHigh.selector, WAD + 1));
        vm.prank(admin);
        distributor.setRebatePerRipCap(WAD + 1);
    }

    function test_rateSettersRequireAdmin() public {
        vm.startPrank(stranger);

        vm.expectRevert();
        distributor.setMakerRatePerEpoch(1);

        vm.expectRevert();
        distributor.setTakerPotPerEpoch(1);

        vm.expectRevert();
        distributor.setRebatePerRipCap(1);

        vm.stopPrank();
    }

    // ========== Posting Claim Roots ==========

    function test_postClaimRootStoresAndEmits() public {
        _endEpoch(0);

        vm.expectEmit(true, false, false, true, address(distributor));
        emit Distributor.ClaimRootPosted(0, ROOT, 500e18);
        vm.prank(admin);
        distributor.postClaimRoot(0, ROOT, 500e18);

        assertEq(distributor.claimRootOf(0), ROOT);
        assertEq(distributor.claimTotalOf(0), 500e18);
        assertEq(distributor.claimedTotalOf(0), 0);
        assertEq(distributor.claimCountOf(0), 0);
        assertEq(distributor.unclaimedOf(0), 500e18);
    }

    function test_postClaimRootRequiresAdmin() public {
        _endEpoch(0);

        bytes32 role = distributor.DEFAULT_ADMIN_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        vm.prank(stranger);
        distributor.postClaimRoot(0, ROOT, 500e18);
    }

    function test_postClaimRootRejectsZeroRoot() public {
        _endEpoch(0);

        vm.expectRevert(Distributor.ZeroRoot.selector);
        vm.prank(admin);
        distributor.postClaimRoot(0, bytes32(0), 500e18);
    }

    function test_postClaimRootRejectsZeroTotal() public {
        _endEpoch(0);

        vm.expectRevert(Distributor.ZeroAmount.selector);
        vm.prank(admin);
        distributor.postClaimRoot(0, ROOT, 0);
    }

    function test_postClaimRootRejectsUnfinishedEpoch() public {
        // Still inside epoch 0.
        vm.expectRevert(abi.encodeWithSelector(Distributor.EpochNotEnded.selector, 0, 0));
        vm.prank(admin);
        distributor.postClaimRoot(0, ROOT, 500e18);

        _endEpoch(0);

        // Epoch 1 is now the live one.
        vm.expectRevert(abi.encodeWithSelector(Distributor.EpochNotEnded.selector, 1, 1));
        vm.prank(admin);
        distributor.postClaimRoot(1, ROOT, 500e18);
    }

    function test_postClaimRootReplaceableBeforeAnyClaim() public {
        _endEpoch(0);

        vm.prank(admin);
        distributor.postClaimRoot(0, ROOT, 500e18);

        vm.expectEmit(true, false, false, true, address(distributor));
        emit Distributor.ClaimRootReplaced(0, ROOT, OTHER_ROOT, 700e18);
        vm.prank(admin);
        distributor.postClaimRoot(0, OTHER_ROOT, 700e18);

        assertEq(distributor.claimRootOf(0), OTHER_ROOT);
        assertEq(distributor.claimTotalOf(0), 700e18);
    }

    function test_postClaimRootFrozenAfterFirstClaim() public {
        Entitlement[] memory list =
            _entitlements(Entitlement(maker, 10e18, 0), Entitlement(taker, 0, 5e18), Entitlement(maker2, 3e18, 1e18));
        _postEpoch(0, list);

        distributor.claim(maker, _claimInput(0, list, 0));
        assertEq(distributor.claimCountOf(0), 1);

        vm.expectRevert(abi.encodeWithSelector(Distributor.ClaimRootFrozen.selector, 0, 1));
        vm.prank(admin);
        distributor.postClaimRoot(0, OTHER_ROOT, 700e18);
    }

    // ========== Raising an under-declared total ==========

    function test_increaseClaimTotalRaisesTheCeiling() public {
        _endEpoch(0);
        vm.prank(admin);
        distributor.postClaimRoot(0, ROOT, 500e18);

        vm.expectEmit(true, false, false, true, address(distributor));
        emit Distributor.ClaimTotalIncreased(0, 500e18, 900e18);
        vm.prank(admin);
        distributor.increaseClaimTotal(0, 900e18);

        assertEq(distributor.claimTotalOf(0), 900e18);
        assertEq(distributor.claimRootOf(0), ROOT, "root must be untouched");
    }

    function test_increaseClaimTotalRejectsLoweringOrNoOp() public {
        _endEpoch(0);
        vm.prank(admin);
        distributor.postClaimRoot(0, ROOT, 500e18);

        vm.expectRevert(abi.encodeWithSelector(Distributor.ClaimTotalNotIncreased.selector, 0, 400e18, 500e18));
        vm.prank(admin);
        distributor.increaseClaimTotal(0, 400e18);

        vm.expectRevert(abi.encodeWithSelector(Distributor.ClaimTotalNotIncreased.selector, 0, 500e18, 500e18));
        vm.prank(admin);
        distributor.increaseClaimTotal(0, 500e18);
    }

    function test_increaseClaimTotalRequiresAPostedRoot() public {
        vm.expectRevert(abi.encodeWithSelector(Distributor.ClaimRootNotPosted.selector, 0));
        vm.prank(admin);
        distributor.increaseClaimTotal(0, 500e18);
    }

    function test_increaseClaimTotalRequiresAdmin() public {
        _endEpoch(0);
        vm.prank(admin);
        distributor.postClaimRoot(0, ROOT, 500e18);

        bytes32 role = distributor.DEFAULT_ADMIN_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        vm.prank(stranger);
        distributor.increaseClaimTotal(0, 900e18);
    }

    /// @dev The failure this lever exists for: a total posted below the sum the root commits to.
    ///      The first claim freezes the root, so without a way to raise the ceiling every later
    ///      claimant would be stranded permanently.
    function test_underDeclaredTotalIsRecoverableAfterClaimsBegin() public {
        Entitlement[] memory list = _entitlements(Entitlement(maker, 100e18, 0), Entitlement(taker, 100e18, 0));
        _endEpoch(0);
        bytes32 root = _rootOf(0, list);
        Distributor.ClaimInput memory first = _claimInput(0, list, 0);
        Distributor.ClaimInput memory second = _claimInput(0, list, 1);

        // Root commits to 200e18; the admin fat-fingers the declared total as 150e18.
        vm.prank(admin);
        distributor.postClaimRoot(0, root, 150e18);

        distributor.claim(maker, first);

        vm.expectRevert(abi.encodeWithSelector(Distributor.EpochTotalExceeded.selector, 0, 200e18, 150e18));
        distributor.claim(taker, second);

        // The root is frozen by now, so re-posting cannot fix it...
        vm.expectRevert(abi.encodeWithSelector(Distributor.ClaimRootFrozen.selector, 0, 1));
        vm.prank(admin);
        distributor.postClaimRoot(0, root, 200e18);

        // ...but raising the ceiling can, without touching who is owed what.
        vm.prank(admin);
        distributor.increaseClaimTotal(0, 200e18);

        distributor.claim(taker, second);
        assertEq(token.balanceOf(taker), 100e18);
        assertEq(distributor.claimedTotalOf(0), 200e18);
        assertEq(distributor.unclaimedOf(0), 0);
    }

    function test_raisingTheCeilingCannotCreateEntitlements() public {
        Entitlement[] memory list = _entitlements(Entitlement(maker, 10e18, 0), Entitlement(taker, 5e18, 0));
        _postEpoch(0, list);
        Distributor.ClaimInput memory input = _claimInput(0, list, 0);

        vm.prank(admin);
        distributor.increaseClaimTotal(0, 1_000_000e18);

        // The root still decides everything: an unlisted account gains nothing from the headroom.
        vm.expectRevert(abi.encodeWithSelector(Distributor.InvalidProof.selector, 0, stranger));
        distributor.claim(stranger, input);

        // And a listed one is still paid exactly its leaf.
        distributor.claim(maker, input);
        assertEq(token.balanceOf(maker), 10e18);
    }

    function test_rootsAreIndependentPerEpoch() public {
        _endEpoch(1);

        vm.startPrank(admin);
        distributor.postClaimRoot(0, ROOT, 100e18);
        distributor.postClaimRoot(1, OTHER_ROOT, 200e18);
        vm.stopPrank();

        assertEq(distributor.claimRootOf(0), ROOT);
        assertEq(distributor.claimRootOf(1), OTHER_ROOT);
        assertEq(distributor.claimRootOf(2), bytes32(0));
    }
}
