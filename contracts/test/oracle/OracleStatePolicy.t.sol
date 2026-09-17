// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";

import {BaseV1Constants} from "../fixtures/BaseV1Constants.sol";
import {OracleFixtures} from "../fixtures/OracleFixtures.sol";
import {IOracleAdapter} from "../../src/interfaces/IOracleAdapter.sol";
import {OracleStatePolicy} from "../../src/OracleStatePolicy.sol";

/// @dev RPC-free fixtures for the test-only classifier. Not production oracle code.
contract OracleStatePolicyTest is Test {
    using OracleStatePolicy for OracleStatePolicy.Input;

    // Sampled historical rounds at the same pinned fork. See contracts/fork/README.md.
    uint80 internal constant FRIDAY_ROUND_ID = 36_893_488_147_419_103_578;
    uint256 internal constant FRIDAY_UPDATED_AT = 1_789_155_215;
    uint256 internal constant SUNDAY_NOON_ET_TS = 1_789_315_201;
    uint80 internal constant MONDAY_POST_ROUND_ID = 36_893_488_147_419_103_592;
    uint256 internal constant MONDAY_POST_UPDATED_AT = 1_789_418_327;
    uint256 internal constant MONDAY_LATE_ET_TS = 1_789_459_199;

    function test_goodCurrentRoundIsLive() public pure {
        assertEq(uint256(OracleFixtures.live().classify()), uint256(IOracleAdapter.State.LIVE));
    }

    function test_explicitRegistryPauseIsHeld() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.held();
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.HELD));
    }

    function test_pauseBeatsStalePrice() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.held();
        input.nowTs = OracleFixtures.NVDA_UPDATED_AT + OracleStatePolicy.MAX_LIVE_AGE + 1;
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.HELD));
    }

    function test_staleUnpausedRoundIsInvalid() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.staleInvalid();
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.INVALID));
    }

    function test_ageEqualToMaxLiveAgeIsLive() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.live();
        input.nowTs = OracleFixtures.NVDA_UPDATED_AT + OracleStatePolicy.MAX_LIVE_AGE;
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.LIVE));
    }

    function test_weekendStaleUnpausedIsInvalid() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.live();
        input.price.roundId = FRIDAY_ROUND_ID;
        input.price.answeredInRound = FRIDAY_ROUND_ID;
        input.price.startedAt = FRIDAY_UPDATED_AT - 14;
        input.price.updatedAt = FRIDAY_UPDATED_AT;
        input.nowTs = SUNDAY_NOON_ET_TS;
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.INVALID));
        assertGt(SUNDAY_NOON_ET_TS - FRIDAY_UPDATED_AT, OracleStatePolicy.MAX_LIVE_AGE);
    }

    function test_overnightStaleUnpausedIsInvalid() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.live();
        input.price.roundId = MONDAY_POST_ROUND_ID;
        input.price.answeredInRound = MONDAY_POST_ROUND_ID;
        input.price.startedAt = MONDAY_POST_UPDATED_AT - 14;
        input.price.updatedAt = MONDAY_POST_UPDATED_AT;
        input.nowTs = MONDAY_LATE_ET_TS;
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.INVALID));
        assertGt(MONDAY_LATE_ET_TS - MONDAY_POST_UPDATED_AT, OracleStatePolicy.MAX_LIVE_AGE);
    }

    function test_zeroAnswerIsInvalid() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.live();
        input.price.answer = 0;
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.INVALID));
    }

    function test_negativeAnswerIsInvalid() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.live();
        input.price.answer = -1;
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.INVALID));
    }

    function test_futureTimestampIsInvalid() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.live();
        input.price.updatedAt = BaseV1Constants.PINNED_TIMESTAMP + 1;
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.INVALID));
    }

    function test_incompleteRoundIsInvalid() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.live();
        input.price.answeredInRound = OracleFixtures.NVDA_ROUND_ID - 1;
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.INVALID));
    }

    function test_zeroStartedAtIsInvalid() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.live();
        input.price.startedAt = 0;
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.INVALID));
    }

    function test_sequencerDownIsInvalid() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.sequencerDown();
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.INVALID));
    }

    function test_sequencerInsideRecoveryGraceIsInvalid() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.sequencerRecoveryGrace();
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.INVALID));
    }

    function test_sequencerJustStartedIsInvalid() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.live();
        input.sequencer.answer = 0;
        input.sequencer.startedAt = BaseV1Constants.PINNED_TIMESTAMP;
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.INVALID));
    }

    function test_sequencerBeyondRecoveryGraceCanBeLive() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.live();
        input.sequencer.answer = 0;
        input.sequencer.startedAt = BaseV1Constants.PINNED_TIMESTAMP - OracleStatePolicy.SEQUENCER_GRACE_PERIOD - 1;
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.LIVE));
    }

    function test_unpausedWithoutNewerPostHoldRoundIsInvalid() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.unpausedWithoutFreshPostHoldRound();
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.INVALID));
    }

    function test_unpausedWithNewerQualifyingRoundIsLive() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.unpausedWithFreshPostHoldRound();
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.LIVE));
    }

    function test_unpausedWithNewerButStaleRoundIsInvalid() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.unpausedWithFreshPostHoldRound();
        input.nowTs = OracleFixtures.NVDA_UPDATED_AT + OracleStatePolicy.MAX_LIVE_AGE + 1;
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.INVALID));
    }

    function test_failedRegistryReadIsInvalid() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.live();
        input.registryOk = false;
        input.registryPaused = true;
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.INVALID));
    }

    function test_failedFeedReadIsInvalid() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.live();
        input.feedOk = false;
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.INVALID));
    }

    function test_failedSequencerReadIsInvalid() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.live();
        input.sequencerOk = false;
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.INVALID));
    }

    function test_failedSequencerReadDoesNotOverrideExplicitHold() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.held();
        input.sequencerOk = false;
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.HELD));
    }

    function test_maxLiveAgeIsEightHours() public pure {
        assertEq(OracleStatePolicy.MAX_LIVE_AGE, 8 hours);
        assertEq(OracleStatePolicy.SEQUENCER_GRACE_PERIOD, 3600);
        assertLt(BaseV1Constants.PINNED_TIMESTAMP - OracleFixtures.NVDA_UPDATED_AT, OracleStatePolicy.MAX_LIVE_AGE);
    }

    function test_ageOnlyPolicyCanRemainLiveIntoQuietClosedPeriod() public pure {
        OracleStatePolicy.Input memory input = OracleFixtures.live();
        input.price.roundId = FRIDAY_ROUND_ID;
        input.price.answeredInRound = FRIDAY_ROUND_ID;
        input.price.startedAt = FRIDAY_UPDATED_AT - 14;
        input.price.updatedAt = FRIDAY_UPDATED_AT;
        input.nowTs = FRIDAY_UPDATED_AT + OracleStatePolicy.MAX_LIVE_AGE;
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.LIVE));
        input.nowTs = FRIDAY_UPDATED_AT + OracleStatePolicy.MAX_LIVE_AGE + 1;
        assertEq(uint256(input.classify()), uint256(IOracleAdapter.State.INVALID));
    }
}
