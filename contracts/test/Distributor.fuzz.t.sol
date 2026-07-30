// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Distributor} from "../src/Distributor.sol";
import {DistributorFixture} from "./helpers/DistributorFixture.sol";

contract DistributorFuzzTest is Test, DistributorFixture {
    function setUp() public override {
        super.setUp();
    }

    function testFuzz_makerAccrualScalesWithDwell(uint16 seconds_) public {
        uint256 dwell = uint256(seconds_) + 1;
        vm.prank(admin);
        distributor.setMakerRatePerEpoch(1 days);

        _enterPack(1, maker);
        vm.warp(block.timestamp + dwell);

        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        assertEq(distributor.claimMaker(maker, ids), dwell);
    }

    function testFuzz_equalDwellEqualReward(uint8 packs_, uint16 seconds_) public {
        uint256 n = bound(packs_, 1, 20);
        uint256 dwell = uint256(seconds_) + 1;
        vm.prank(admin);
        distributor.setMakerRatePerEpoch(1 days);

        for (uint256 i; i < n; ++i) {
            _enterPack(i + 1, maker);
        }
        vm.warp(block.timestamp + dwell);

        uint256[] memory ids = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            ids[i] = i + 1;
        }
        assertEq(distributor.claimMaker(maker, ids), n * dwell);
    }

    function testFuzz_takerSharesSumAtMostPot(uint8 a, uint8 b, uint8 c, uint128 pot_) public {
        uint256 pot = bound(pot_, 1, FUNDED);
        uint256 ca = uint256(a) + 1;
        uint256 cb = uint256(b) + 1;
        uint256 cc = uint256(c) + 1;

        vm.prank(admin);
        distributor.setTakerPotPerEpoch(pot);

        _recordRip(taker, ca);
        _recordRip(taker2, cb);
        _recordRip(stranger, cc);
        _endEpoch(0);

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 0;
        uint256 pa = distributor.claimTaker(taker, epochs);
        uint256 pb = distributor.claimTaker(taker2, epochs);
        uint256 pc = distributor.claimTaker(stranger, epochs);

        assertLe(pa + pb + pc, pot);
    }

    function testFuzz_claimsNeverExceedFunded(uint16 makerDwell, uint8 ripCount) public {
        uint256 dwell = bound(makerDwell, 1, 2 days);
        uint256 count = uint256(ripCount % 5) + 1;

        vm.startPrank(admin);
        distributor.setMakerRatePerEpoch(FUNDED / 4);
        distributor.setTakerPotPerEpoch(FUNDED / 4);
        vm.stopPrank();

        _enterPack(1, maker);
        uint256 enteredAt = block.timestamp;
        _recordRip(taker, count);
        uint256 ripEpoch = distributor.currentEpoch();

        vm.warp(enteredAt + dwell);
        _endEpoch(ripEpoch);

        uint256 funded = distributor.fundedBalance();
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        uint256 makerOwed = distributor.claimableMakerOf(maker, ids);
        uint256 takerOwed = distributor.claimableTakerOf(taker, ripEpoch);

        if (makerOwed > 0 && makerOwed <= funded) {
            distributor.claimMaker(maker, ids);
        }
        uint256 remaining = distributor.fundedBalance();
        if (takerOwed > 0 && takerOwed <= remaining) {
            uint256[] memory epochs = new uint256[](1);
            epochs[0] = ripEpoch;
            distributor.claimTaker(taker, epochs);
        }

        assertLe(distributor.totalClaimed(), FUNDED);
        assertEq(token.balanceOf(maker) + token.balanceOf(taker) + distributor.fundedBalance(), FUNDED);
    }
}
