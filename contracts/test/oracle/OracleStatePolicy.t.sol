// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";

import {OracleStatePolicy} from "./OracleStatePolicy.sol";

/// @dev RPC-free fixtures for the test-only classifier. Not production oracle code.
contract OracleStatePolicyTest is Test {
    using OracleStatePolicy for OracleStatePolicy.Input;

    // Pinned Base snapshot (block 51356323) used as the known-good LIVE fixture.
    uint256 internal constant PINNED_TS = 1_789_501_993;
    uint80 internal constant NVDA_ROUND_ID = 36_893_488_147_419_103_594;
    int256 internal constant NVDA_ANSWER = 21_178_500_000;
    uint256 internal constant NVDA_STARTED_AT = 1_789_483_930;
    uint256 internal constant NVDA_UPDATED_AT = 1_789_483_945;

    uint80 internal constant SEQ_ROUND_ID = 18_446_744_073_709_551_636;
    uint256 internal constant SEQ_STARTED_AT = 1_782_491_507;
    uint256 internal constant SEQ_UPDATED_AT = 1_789_491_993;

    // Sampled historical rounds at the same pinned fork. See contracts/fork/README.md.
    uint80 internal constant FRIDAY_ROUND_ID = 36_893_488_147_419_103_578;
    uint256 internal constant FRIDAY_UPDATED_AT = 1_789_155_215;
    uint256 internal constant SUNDAY_NOON_ET_TS = 1_789_315_201;
    uint80 internal constant MONDAY_POST_ROUND_ID = 36_893_488_147_419_103_592;
    uint256 internal constant MONDAY_POST_UPDATED_AT = 1_789_418_327;
    uint256 internal constant MONDAY_LATE_ET_TS = 1_789_459_199;

    function test_goodCurrentRoundIsLive() public pure {
        assertEq(uint256(_live().classify()), uint256(OracleStatePolicy.State.LIVE));
    }

    function test_explicitRegistryPauseIsHeld() public pure {
        OracleStatePolicy.Input memory input = _live();
        input.registryPaused = true;
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.HELD));
    }

    function test_pauseBeatsStalePrice() public pure {
        OracleStatePolicy.Input memory input = _live();
        input.registryPaused = true;
        input.nowTs = NVDA_UPDATED_AT + OracleStatePolicy.MAX_LIVE_AGE + 1;
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.HELD));
    }

    function test_staleUnpausedRoundIsInvalid() public pure {
        OracleStatePolicy.Input memory input = _live();
        input.nowTs = NVDA_UPDATED_AT + OracleStatePolicy.MAX_LIVE_AGE + 1;
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.INVALID));
    }

    function test_ageEqualToMaxLiveAgeIsLive() public pure {
        OracleStatePolicy.Input memory input = _live();
        input.nowTs = NVDA_UPDATED_AT + OracleStatePolicy.MAX_LIVE_AGE;
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.LIVE));
    }

    function test_weekendStaleUnpausedIsInvalid() public pure {
        OracleStatePolicy.Input memory input = _live();
        input.price.roundId = FRIDAY_ROUND_ID;
        input.price.answeredInRound = FRIDAY_ROUND_ID;
        input.price.startedAt = FRIDAY_UPDATED_AT - 14;
        input.price.updatedAt = FRIDAY_UPDATED_AT;
        input.nowTs = SUNDAY_NOON_ET_TS;
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.INVALID));
        assertGt(SUNDAY_NOON_ET_TS - FRIDAY_UPDATED_AT, OracleStatePolicy.MAX_LIVE_AGE);
    }

    function test_overnightStaleUnpausedIsInvalid() public pure {
        OracleStatePolicy.Input memory input = _live();
        input.price.roundId = MONDAY_POST_ROUND_ID;
        input.price.answeredInRound = MONDAY_POST_ROUND_ID;
        input.price.startedAt = MONDAY_POST_UPDATED_AT - 14;
        input.price.updatedAt = MONDAY_POST_UPDATED_AT;
        input.nowTs = MONDAY_LATE_ET_TS;
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.INVALID));
        assertGt(MONDAY_LATE_ET_TS - MONDAY_POST_UPDATED_AT, OracleStatePolicy.MAX_LIVE_AGE);
    }

    function test_zeroAnswerIsInvalid() public pure {
        OracleStatePolicy.Input memory input = _live();
        input.price.answer = 0;
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.INVALID));
    }

    function test_negativeAnswerIsInvalid() public pure {
        OracleStatePolicy.Input memory input = _live();
        input.price.answer = -1;
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.INVALID));
    }

    function test_futureTimestampIsInvalid() public pure {
        OracleStatePolicy.Input memory input = _live();
        input.price.updatedAt = PINNED_TS + 1;
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.INVALID));
    }

    function test_incompleteRoundIsInvalid() public pure {
        OracleStatePolicy.Input memory input = _live();
        input.price.answeredInRound = NVDA_ROUND_ID - 1;
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.INVALID));
    }

    function test_zeroStartedAtIsInvalid() public pure {
        OracleStatePolicy.Input memory input = _live();
        input.price.startedAt = 0;
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.INVALID));
    }

    function test_sequencerDownIsInvalid() public pure {
        OracleStatePolicy.Input memory input = _live();
        input.sequencer.answer = 1;
        input.sequencer.startedAt = PINNED_TS - 10_000;
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.INVALID));
    }

    function test_sequencerInsideRecoveryGraceIsInvalid() public pure {
        OracleStatePolicy.Input memory input = _live();
        input.sequencer.answer = 0;
        input.sequencer.startedAt = PINNED_TS - OracleStatePolicy.SEQUENCER_GRACE_PERIOD;
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.INVALID));
    }

    function test_sequencerJustStartedIsInvalid() public pure {
        OracleStatePolicy.Input memory input = _live();
        input.sequencer.answer = 0;
        input.sequencer.startedAt = PINNED_TS;
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.INVALID));
    }

    function test_sequencerBeyondRecoveryGraceCanBeLive() public pure {
        OracleStatePolicy.Input memory input = _live();
        input.sequencer.answer = 0;
        input.sequencer.startedAt = PINNED_TS - OracleStatePolicy.SEQUENCER_GRACE_PERIOD - 1;
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.LIVE));
    }

    function test_unpausedWithoutNewerPostHoldRoundIsInvalid() public pure {
        OracleStatePolicy.Input memory input = _live();
        input.hasPriorHold = true;
        input.heldRoundId = NVDA_ROUND_ID;
        input.heldUpdatedAt = NVDA_UPDATED_AT;
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.INVALID));
    }

    function test_unpausedWithNewerQualifyingRoundIsLive() public pure {
        OracleStatePolicy.Input memory input = _live();
        input.hasPriorHold = true;
        input.heldRoundId = NVDA_ROUND_ID - 1;
        input.heldUpdatedAt = NVDA_UPDATED_AT - 60;
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.LIVE));
    }

    function test_unpausedWithNewerButStaleRoundIsInvalid() public pure {
        OracleStatePolicy.Input memory input = _live();
        input.hasPriorHold = true;
        input.heldRoundId = NVDA_ROUND_ID - 1;
        input.heldUpdatedAt = NVDA_UPDATED_AT - 60;
        input.nowTs = NVDA_UPDATED_AT + OracleStatePolicy.MAX_LIVE_AGE + 1;
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.INVALID));
    }

    function test_failedRegistryReadIsInvalid() public pure {
        OracleStatePolicy.Input memory input = _live();
        input.registryOk = false;
        input.registryPaused = true;
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.INVALID));
    }

    function test_failedFeedReadIsInvalid() public pure {
        OracleStatePolicy.Input memory input = _live();
        input.feedOk = false;
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.INVALID));
    }

    function test_failedSequencerReadIsInvalid() public pure {
        OracleStatePolicy.Input memory input = _live();
        input.sequencerOk = false;
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.INVALID));
    }

    function test_failedSequencerReadDoesNotOverrideExplicitHold() public pure {
        OracleStatePolicy.Input memory input = _live();
        input.sequencerOk = false;
        input.registryPaused = true;
        assertEq(uint256(input.classify()), uint256(OracleStatePolicy.State.HELD));
    }

    function test_maxLiveAgeSitsBetweenExpectedQuietAndOvernight() public pure {
        uint256 expectedSessionQuiet = 24_254;
        uint256 shortestOvernightStyleGap = 28_936;
        uint256 weekendGap = 188_820;
        uint256 pinnedAge = PINNED_TS - NVDA_UPDATED_AT;
        assertEq(OracleStatePolicy.MAX_LIVE_AGE, 8 hours);
        assertLt(expectedSessionQuiet, OracleStatePolicy.MAX_LIVE_AGE);
        assertLt(pinnedAge, OracleStatePolicy.MAX_LIVE_AGE);
        assertGt(shortestOvernightStyleGap, OracleStatePolicy.MAX_LIVE_AGE);
        assertGt(weekendGap, OracleStatePolicy.MAX_LIVE_AGE);
        assertEq(OracleStatePolicy.SEQUENCER_GRACE_PERIOD, 3600);
    }

    function _live() private pure returns (OracleStatePolicy.Input memory input) {
        input.feedOk = true;
        input.registryOk = true;
        input.sequencerOk = true;
        input.registryPaused = false;
        input.nowTs = PINNED_TS;
        input.price = OracleStatePolicy.RoundData({
            roundId: NVDA_ROUND_ID,
            answer: NVDA_ANSWER,
            startedAt: NVDA_STARTED_AT,
            updatedAt: NVDA_UPDATED_AT,
            answeredInRound: NVDA_ROUND_ID
        });
        input.sequencer = OracleStatePolicy.RoundData({
            roundId: SEQ_ROUND_ID,
            answer: 0,
            startedAt: SEQ_STARTED_AT,
            updatedAt: SEQ_UPDATED_AT,
            answeredInRound: SEQ_ROUND_ID
        });
    }
}
