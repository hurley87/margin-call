// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Distributor} from "../src/Distributor.sol";
import {DistributorFixture} from "./helpers/DistributorFixture.sol";

contract DistributorMakerTest is Test, DistributorFixture {
    uint256 constant RATE = 1_000e18; // tokens per Pack per epoch

    function setUp() public override {
        super.setUp();
        vm.prank(admin);
        distributor.setMakerRatePerEpoch(RATE);
    }

    function test_fullEpochAccruesExactlyRate() public {
        _enterPack(1, maker);
        vm.warp(block.timestamp + 1 days);

        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        uint256 paid = distributor.claimMaker(maker, ids);

        assertEq(paid, RATE);
        assertEq(token.balanceOf(maker), RATE);
        assertEq(distributor.makerCredit(maker), 0);
    }

    function test_halfEpochAccruesHalfRate() public {
        _enterPack(1, maker);
        vm.warp(block.timestamp + 12 hours);

        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        assertEq(distributor.claimMaker(maker, ids), RATE / 2);
    }

    function test_twoEqualPacksAccrueIndependently() public {
        _enterPack(1, maker);
        _enterPack(2, maker);
        vm.warp(block.timestamp + 1 days);

        uint256[] memory ids = new uint256[](2);
        ids[0] = 1;
        ids[1] = 2;
        assertEq(distributor.claimMaker(maker, ids), 2 * RATE);
    }

    function test_exitCrystallizesAndStopsAccrual() public {
        _enterPack(1, maker);
        vm.warp(block.timestamp + 6 hours);
        _exitPack(1);
        uint256 mid = block.timestamp;
        vm.warp(mid + 1 days);

        uint256[] memory empty = new uint256[](0);
        assertEq(distributor.claimMaker(maker, empty), RATE / 4);
    }

    function test_reentryStartsFreshDebt() public {
        _enterPack(1, maker);
        vm.warp(block.timestamp + 1 days);
        _exitPack(1);

        _enterPack(1, maker);
        vm.warp(block.timestamp + 12 hours);

        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        uint256[] memory empty = new uint256[](0);
        // Prior day crystallized into credit on exit; half day still pending on the Pack.
        assertEq(distributor.claimableMakerOf(maker, ids), RATE + RATE / 2);
        assertEq(distributor.claimMaker(maker, ids), RATE + RATE / 2);
        assertEq(distributor.claimableMakerOf(maker, empty), 0);
    }

    function test_rateChangeIsProspective() public {
        _enterPack(1, maker);
        vm.warp(block.timestamp + 12 hours);

        vm.prank(admin);
        distributor.setMakerRatePerEpoch(RATE * 2);

        vm.warp(block.timestamp + 12 hours);

        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        // First half at RATE, second half at 2*RATE.
        assertEq(distributor.claimMaker(maker, ids), RATE / 2 + RATE);
    }

    function test_sponsoredClaimPaysAccount() public {
        _enterPack(1, maker);
        vm.warp(block.timestamp + 1 days);

        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        vm.prank(stranger);
        distributor.claimMaker(maker, ids);

        assertEq(token.balanceOf(maker), RATE);
        assertEq(token.balanceOf(stranger), 0);
    }

    function test_underfundedClaimRevertsWithoutConsuming() public {
        // Drain the Distributor so the claim cannot pay.
        vm.prank(admin);
        distributor.setMakerRatePerEpoch(FUNDED + 1e18);
        _enterPack(1, maker);
        vm.warp(block.timestamp + 1 days);

        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        uint256 pending = distributor.claimableMakerOf(maker, ids);
        assertGt(pending, FUNDED);

        vm.expectRevert(abi.encodeWithSelector(Distributor.InsufficientFunds.selector, pending, FUNDED));
        distributor.claimMaker(maker, ids);

        // Entitlement survives for a later top-up.
        assertEq(distributor.claimableMakerOf(maker, ids), pending);
        _fund(pending - FUNDED);
        assertEq(distributor.claimMaker(maker, ids), pending);
    }

    function test_nothingToClaimReverts() public {
        uint256[] memory empty = new uint256[](0);
        vm.expectRevert(Distributor.NothingToClaim.selector);
        distributor.claimMaker(maker, empty);
    }

    function test_onlyRipEngineMayEnterOrExit() public {
        vm.expectRevert(Distributor.OnlyRipEngine.selector);
        distributor.onPackEntered(1, maker);

        _enterPack(1, maker);
        vm.expectRevert(Distributor.OnlyRipEngine.selector);
        distributor.onPackExited(1);
    }

    function test_doubleEnterReverts() public {
        _enterPack(1, maker);
        vm.expectRevert(abi.encodeWithSelector(Distributor.PackAlreadyEnrolled.selector, 1));
        _enterPack(1, maker2);
    }

    function test_exitWithoutEnterReverts() public {
        vm.expectRevert(abi.encodeWithSelector(Distributor.PackNotEnrolled.selector, 99));
        _exitPack(99);
    }

    function test_fractionalRemainderCarries() public {
        // Rate that does not divide evenly by seconds-in-epoch for a 1-second dwell.
        vm.prank(admin);
        distributor.setMakerRatePerEpoch(1 days + 1);

        _enterPack(1, maker);
        vm.warp(block.timestamp + 1);
        assertEq(distributor.pendingMakerOf(1), 1);

        vm.warp(block.timestamp + 1 days - 1);
        assertEq(distributor.pendingMakerOf(1), 1 days + 1);
    }
}
