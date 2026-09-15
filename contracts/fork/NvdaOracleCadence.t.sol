// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";

import {OracleStatePolicy} from "../test/oracle/OracleStatePolicy.sol";

interface IAggregatorV3Read {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);

    function getRoundData(uint80 roundId)
        external
        view
        returns (uint80 id, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

interface ICoinbaseOracleRegistryRead {
    function getOracleParams(address token) external view returns (uint256 multiplier, bool paused);
}

/// @dev Fork evidence for MAX_LIVE_AGE. Not OracleAdapter.
contract NvdaOracleCadenceTest is Test {
    using OracleStatePolicy for OracleStatePolicy.Input;

    uint256 internal constant BASE_BLOCK = 51_356_323;
    address internal constant NVDAC = 0xb20000000000000000000078ee7ce2fE4908108C;
    address internal constant NVDA_FEED = 0x04689a41629776563E6822F76f2e57D148d28513;
    address internal constant REGISTRY = 0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD;
    address internal constant SEQUENCER = 0xBCF85224fc0756B9Fa45aA7892530B47e10b6433;

    uint80 internal constant PHASE_BASE = uint80(uint256(2) << 64);

    function setUp() public {
        vm.createSelectFork(vm.envString("BASE_MAINNET_RPC_URL"), BASE_BLOCK);
    }

    function test_pinnedSnapshotClassifiesLive() public view {
        OracleStatePolicy.Input memory input = _observation(block.timestamp);
        assertFalse(input.registryPaused);
        assertEq(input.nowTs - input.price.updatedAt, 18_048);
        assertLt(input.nowTs - input.price.updatedAt, OracleStatePolicy.MAX_LIVE_AGE);
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.LIVE));
    }

    function test_sampledRoundGapsPinMaxLiveAge() public view {
        IAggregatorV3Read feed = IAggregatorV3Read(NVDA_FEED);

        uint256 rthQuiet = _gap(feed, 327, 328);
        uint256 expectedSessionQuiet = _gap(feed, 334, 335);
        uint256 overnightGap = _gap(feed, 360, 361);
        uint256 weekendGap = _gap(feed, 346, 347);
        uint256 laborDayGap = _gap(feed, 313, 314);
        uint256 sunOpenToMondayPre = _gap(feed, 32, 33);

        assertEq(rthQuiet, 18_822);
        assertEq(expectedSessionQuiet, 24_254);
        assertEq(overnightGap, 60_426);
        assertEq(weekendGap, 188_820);
        assertEq(laborDayGap, 280_578);
        assertEq(sunOpenToMondayPre, 28_936);

        assertLt(rthQuiet, OracleStatePolicy.MAX_LIVE_AGE);
        assertLt(expectedSessionQuiet, OracleStatePolicy.MAX_LIVE_AGE);
        assertGt(sunOpenToMondayPre, OracleStatePolicy.MAX_LIVE_AGE);
        assertGt(overnightGap, OracleStatePolicy.MAX_LIVE_AGE);
        assertGt(weekendGap, OracleStatePolicy.MAX_LIVE_AGE);
        assertGt(laborDayGap, OracleStatePolicy.MAX_LIVE_AGE);
    }

    function test_weekendUnpausedStaleClassifiesInvalid() public view {
        OracleStatePolicy.Input memory input = _observation(block.timestamp);
        (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) =
            IAggregatorV3Read(NVDA_FEED).getRoundData(PHASE_BASE + 346);
        input.price = OracleStatePolicy.RoundData({
            roundId: roundId,
            answer: answer,
            startedAt: startedAt,
            updatedAt: updatedAt,
            answeredInRound: answeredInRound
        });
        input.nowTs = 1_789_315_201;
        assertFalse(input.registryPaused);
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.INVALID));
    }

    function test_sampledRoundValues() public view {
        IAggregatorV3Read feed = IAggregatorV3Read(NVDA_FEED);
        _assertRound(feed, 346, 1_789_155_215, 21_828_500_000);
        _assertRound(feed, 347, 1_789_344_035, 21_570_999_999);
        _assertRound(feed, 360, 1_789_418_327, 21_195_000_000);
        _assertRound(feed, 362, 1_789_483_945, 21_178_500_000);
    }

    function _observation(uint256 nowTs) private view returns (OracleStatePolicy.Input memory input) {
        input.feedOk = true;
        input.registryOk = true;
        input.sequencerOk = true;
        input.nowTs = nowTs;
        (
            input.price.roundId,
            input.price.answer,
            input.price.startedAt,
            input.price.updatedAt,
            input.price.answeredInRound
        ) = IAggregatorV3Read(NVDA_FEED).latestRoundData();
        (, input.registryPaused) = ICoinbaseOracleRegistryRead(REGISTRY).getOracleParams(NVDAC);
        (
            input.sequencer.roundId,
            input.sequencer.answer,
            input.sequencer.startedAt,
            input.sequencer.updatedAt,
            input.sequencer.answeredInRound
        ) = IAggregatorV3Read(SEQUENCER).latestRoundData();
    }

    function _gap(IAggregatorV3Read feed, uint80 fromLocal, uint80 toLocal) private view returns (uint256) {
        (,,, uint256 fromUpdated,) = feed.getRoundData(PHASE_BASE + fromLocal);
        (,,, uint256 toUpdated,) = feed.getRoundData(PHASE_BASE + toLocal);
        return toUpdated - fromUpdated;
    }

    function _assertRound(IAggregatorV3Read feed, uint80 local, uint256 updatedAt, int256 answer) private view {
        (uint80 roundId, int256 observedAnswer,, uint256 observedUpdated, uint80 answeredInRound) =
            feed.getRoundData(PHASE_BASE + local);
        assertEq(roundId, PHASE_BASE + local);
        assertEq(answeredInRound, roundId);
        assertEq(observedUpdated, updatedAt);
        assertEq(observedAnswer, answer);
    }
}
