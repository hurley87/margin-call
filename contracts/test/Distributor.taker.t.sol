// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Distributor} from "../src/Distributor.sol";
import {DistributorFixture} from "./helpers/DistributorFixture.sol";

contract DistributorTakerTest is Test, DistributorFixture {
    uint256 constant POT = 10_000e18;

    function setUp() public override {
        super.setUp();
        vm.prank(admin);
        distributor.setTakerPotPerEpoch(POT);
    }

    function test_equalSplitAcrossRips() public {
        _recordRip(taker, 1);
        _recordRip(taker2, 3);
        _endEpoch(0);

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 0;

        assertEq(distributor.claimTaker(taker, epochs), POT / 4);
        assertEq(distributor.claimTaker(taker2, epochs), (POT * 3) / 4);
        assertEq(token.balanceOf(taker) + token.balanceOf(taker2), POT);
    }

    function test_batchCountContributesCountRips() public {
        _recordRip(taker, 5);
        _endEpoch(0);

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 0;
        assertEq(distributor.claimTaker(taker, epochs), POT);
        assertEq(distributor.ripCountOf(0), 5);
        assertEq(distributor.accountRipCountOf(0, taker), 5);
    }

    function test_currentEpochCannotBeClaimed() public {
        _recordRip(taker, 1);

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 0;
        vm.expectRevert(abi.encodeWithSelector(Distributor.EpochNotClosed.selector, 0, 0));
        distributor.claimTaker(taker, epochs);
    }

    function test_duplicateClaimReverts() public {
        _recordRip(taker, 1);
        _endEpoch(0);

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 0;
        distributor.claimTaker(taker, epochs);

        vm.expectRevert(abi.encodeWithSelector(Distributor.AlreadyClaimed.selector, 0, taker));
        distributor.claimTaker(taker, epochs);
    }

    function test_emptyEpochCreatesNoLiability() public {
        _endEpoch(0);
        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 0;
        vm.expectRevert(Distributor.NothingToClaim.selector);
        distributor.claimTaker(taker, epochs);
        assertEq(distributor.ripCountOf(0), 0);
        assertEq(distributor.potOf(0), 0);
    }

    function test_floorDustStaysFunded() public {
        vm.prank(admin);
        distributor.setTakerPotPerEpoch(100);
        _recordRip(taker, 1);
        _recordRip(taker2, 1);
        _recordRip(stranger, 1);
        _endEpoch(0);

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 0;
        uint256 a = distributor.claimTaker(taker, epochs);
        uint256 b = distributor.claimTaker(taker2, epochs);
        uint256 c = distributor.claimTaker(stranger, epochs);

        assertEq(a, 33);
        assertEq(b, 33);
        assertEq(c, 33);
        assertEq(a + b + c, 99);
        assertEq(distributor.fundedBalance(), FUNDED - 99);
    }

    function test_potChangeAppliesNextEpoch() public {
        _recordRip(taker, 1);

        vm.prank(admin);
        distributor.setTakerPotPerEpoch(POT * 2);

        // Still in epoch 0 — first Rip froze pot at POT.
        assertEq(distributor.potOf(0), POT);

        _endEpoch(0);
        _recordRip(taker, 1);
        assertEq(distributor.potOf(1), POT * 2);

        _endEpoch(1);
        uint256[] memory e0 = new uint256[](1);
        e0[0] = 0;
        uint256[] memory e1 = new uint256[](1);
        e1[0] = 1;
        assertEq(distributor.claimTaker(taker, e0), POT);
        assertEq(distributor.claimTaker(taker, e1), POT * 2);
    }

    function test_batchClaimAcrossEpochs() public {
        _recordRip(taker, 1);
        _endEpoch(0);
        _recordRip(taker, 1);
        _endEpoch(1);

        uint256[] memory epochs = new uint256[](2);
        epochs[0] = 0;
        epochs[1] = 1;
        assertEq(distributor.claimTaker(taker, epochs), 2 * POT);
    }

    function test_sponsoredClaimPaysAccount() public {
        _recordRip(taker, 1);
        _endEpoch(0);

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 0;
        vm.prank(stranger);
        distributor.claimTaker(taker, epochs);

        assertEq(token.balanceOf(taker), POT);
        assertEq(token.balanceOf(stranger), 0);
    }

    function test_underfundedClaimRevertsWithoutConsuming() public {
        vm.prank(admin);
        distributor.setTakerPotPerEpoch(FUNDED + 1e18);
        _recordRip(taker, 1);
        _endEpoch(0);

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 0;
        uint256 owed = distributor.claimableTakerOf(taker, 0);

        vm.expectRevert(abi.encodeWithSelector(Distributor.InsufficientFunds.selector, owed, FUNDED));
        distributor.claimTaker(taker, epochs);

        assertFalse(distributor.hasClaimed(0, taker));
        _fund(owed - FUNDED);
        assertEq(distributor.claimTaker(taker, epochs), owed);
        assertTrue(distributor.hasClaimed(0, taker));
    }

    function test_onlyRipEngineMayRecordRip() public {
        vm.expectRevert(Distributor.OnlyRipEngine.selector);
        distributor.onRip(taker, 1);
    }

    function test_zeroCountReverts() public {
        vm.expectRevert(Distributor.ZeroAmount.selector);
        _recordRip(taker, 0);
    }

    function test_emptyBatchReverts() public {
        uint256[] memory epochs = new uint256[](0);
        vm.expectRevert(Distributor.EmptyClaimBatch.selector);
        distributor.claimTaker(taker, epochs);
    }

    function test_zeroPotEpochMarksClaimedWithoutTransfer() public {
        vm.prank(admin);
        distributor.setTakerPotPerEpoch(0);
        _recordRip(taker, 1);
        _endEpoch(0);

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 0;
        assertEq(distributor.claimTaker(taker, epochs), 0);
        assertTrue(distributor.hasClaimed(0, taker));
        assertEq(token.balanceOf(taker), 0);
    }
}
