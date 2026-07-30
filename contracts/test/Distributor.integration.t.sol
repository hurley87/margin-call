// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Distributor} from "../src/Distributor.sol";
import {GameToken} from "../src/GameToken.sol";
import {RipEngineFixture} from "./helpers/RipEngineFixture.sol";

/// @notice Real RipEngine pool events produce exact Distributor Maker / Taker claims.
contract DistributorRipEngineIntegrationTest is Test, RipEngineFixture {
    uint256 internal constant TOTAL_SUPPLY = 1_000_000_000e18;
    uint256 internal constant FUNDED = 300_000_000e18;
    uint256 internal constant RATE = 1_000e18;
    uint256 internal constant POT = 10_000e18;

    GameToken internal gameToken;
    Distributor internal rewards;
    address internal treasury = address(uint160(uint256(keccak256(abi.encodePacked("treasury")))));

    function setUp() public override {
        super.setUp();

        gameToken = new GameToken(admin, treasury, TOTAL_SUPPLY);
        rewards = new Distributor(admin, address(gameToken));

        bytes32 distributorRole = gameToken.DISTRIBUTOR_ROLE();
        vm.startPrank(admin);
        gameToken.grantRole(distributorRole, address(rewards));
        rewards.setRipEngine(address(engine));
        engine.setDistributor(address(rewards));
        rewards.setMakerRatePerEpoch(RATE);
        rewards.setTakerPotPerEpoch(POT);
        vm.stopPrank();

        vm.prank(treasury);
        gameToken.transfer(address(rewards), FUNDED);
    }

    function test_enterExitAndRipDriveExactClaims() public {
        // Need eligibleCount > count, so enroll 3 and rip 1.
        uint256 a = _enrollPack(maker, 50e18);
        uint256 b = _enrollPack(maker, 50e18);
        uint256 c = _enrollPack(maker2, 100e18);
        assertEq(rewards.emissionMakerOf(a), maker);
        assertEq(rewards.emissionMakerOf(b), maker);
        assertEq(rewards.emissionMakerOf(c), maker2);

        // Accrue for almost a full epoch without crossing into the next one.
        vm.warp(block.timestamp + 1 days - 1);
        _refreshFeeds();

        uint256[] memory makerIds = new uint256[](2);
        makerIds[0] = a;
        makerIds[1] = b;
        uint256 expectedPerPack = (RATE * (1 days - 1)) / 1 days;
        assertEq(rewards.claimableMakerOf(maker, makerIds), 2 * expectedPerPack);

        uint256 ripEpoch = rewards.currentEpoch();
        vm.prank(taker);
        engine.rip(1, type(uint256).max);

        // One Pack left the pool via Rip — its Maker Emissions crystallized into credit.
        assertEq(rewards.ripCountOf(ripEpoch), 1);
        assertEq(rewards.accountRipCountOf(ripEpoch, taker), 1);

        // Remaining Packs still accrue; ripped Pack is no longer enrolled.
        uint256 enrolled;
        if (rewards.emissionMakerOf(a) != address(0)) enrolled++;
        if (rewards.emissionMakerOf(b) != address(0)) enrolled++;
        if (rewards.emissionMakerOf(c) != address(0)) enrolled++;
        assertEq(enrolled, 2);

        // Claim Maker rewards at the same timestamp so no further accrual lands.
        uint256[] memory all = new uint256[](3);
        all[0] = a;
        all[1] = b;
        all[2] = c;
        uint256 makerPaid = rewards.claimMaker(maker, all);
        uint256 maker2Paid = rewards.claimMaker(maker2, all);
        assertEq(makerPaid + maker2Paid, 3 * expectedPerPack);

        _endEpoch(ripEpoch);
        uint256[] memory epochs = new uint256[](1);
        epochs[0] = ripEpoch;
        assertEq(rewards.claimTaker(taker, epochs), POT);
    }

    function test_manualExitCheckpointsEmissions() public {
        uint256 id = _enrollPack(maker, 50e18);
        // Keep the pool non-empty so exit is just an exit (not required, but realistic).
        _enrollPack(maker2, 50e18);

        vm.warp(block.timestamp + 12 hours);
        vm.prank(maker);
        engine.exitPool(id);

        assertEq(rewards.emissionMakerOf(id), address(0));
        uint256[] memory empty = new uint256[](0);
        assertEq(rewards.claimMaker(maker, empty), RATE / 2);
    }

    function test_distributorBindingIsOneShot() public {
        vm.prank(admin);
        vm.expectRevert();
        engine.setDistributor(address(1));
    }

    function _endEpoch(uint256 epoch) internal {
        uint256 nextStart = rewards.epochStart(epoch + 1);
        if (block.timestamp < nextStart) {
            vm.warp(nextStart);
        }
    }

    function _refreshFeeds() internal {
        vm.startPrank(admin);
        amznFeed.setAnswer(100e8, block.timestamp, false, true);
        amdFeed.setAnswer(50e8, block.timestamp, false, true);
        nflxFeed.setAnswer(200e8, block.timestamp, false, true);
        pltrFeed.setAnswer(25e8, block.timestamp, false, true);
        tslaFeed.setAnswer(300e8, block.timestamp, false, true);
        vm.stopPrank();
    }
}
