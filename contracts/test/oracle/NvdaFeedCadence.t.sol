// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";

import {NvdaFeedCadence} from "./NvdaFeedCadence.sol";

contract NvdaFeedCadenceTest is Test {
    function test_summarizeKnownGaps() public pure {
        uint256[] memory updatedAt = new uint256[](4);
        int256[] memory answers = new int256[](4);
        updatedAt[0] = 1_000;
        updatedAt[1] = 1_030;
        updatedAt[2] = 4_000;
        updatedAt[3] = 4_000 + 8 hours + 1;
        answers[0] = 10_000;
        answers[1] = 10_050;
        answers[2] = 10_000;
        answers[3] = 9_000;

        NvdaFeedCadence.Stats memory stats = NvdaFeedCadence.summarize(updatedAt, answers, 8 hours);
        assertEq(stats.roundCount, 4);
        assertEq(stats.gapCount, 3);
        assertEq(stats.minGap, 30);
        assertEq(stats.maxGap, 8 hours + 1);
        assertEq(stats.medianGap, 2_970);
        assertEq(stats.maxGapAtMostMaxLiveAge, 2_970);
        assertEq(stats.minGapAboveMaxLiveAge, 8 hours + 1);
        assertEq(stats.gapsAboveMaxLiveAge, 1);
        assertEq(stats.gapsAbove1Day, 0);
        assertEq(stats.movesBetween40And70Bps, 2);
        assertEq(stats.medianAbsBps, 50);
    }
}
