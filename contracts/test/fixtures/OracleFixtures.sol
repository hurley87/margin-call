// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {BaseV1Constants} from "./BaseV1Constants.sol";
import {OracleStatePolicy} from "../../src/OracleStatePolicy.sol";

/// @title OracleFixtures
/// @notice RPC-free representative observations for the verified issue #420 oracle policy.
library OracleFixtures {
    uint80 internal constant NVDA_ROUND_ID = 36_893_488_147_419_103_594;
    uint256 internal constant NVDA_STARTED_AT = 1_789_483_930;
    uint256 internal constant NVDA_UPDATED_AT = 1_789_483_945;

    uint80 internal constant SEQUENCER_ROUND_ID = 18_446_744_073_709_551_636;
    uint256 internal constant SEQUENCER_STARTED_AT = 1_782_491_507;
    uint256 internal constant SEQUENCER_UPDATED_AT = 1_789_491_993;

    function live() internal pure returns (OracleStatePolicy.Input memory input) {
        input.feedOk = true;
        input.registryOk = true;
        input.sequencerOk = true;
        input.nowTs = BaseV1Constants.PINNED_TIMESTAMP;
        input.price = OracleStatePolicy.RoundData({
            roundId: NVDA_ROUND_ID,
            answer: int256(BaseV1Constants.PINNED_FEED_ANSWER),
            startedAt: NVDA_STARTED_AT,
            updatedAt: NVDA_UPDATED_AT,
            answeredInRound: NVDA_ROUND_ID
        });
        input.sequencer = OracleStatePolicy.RoundData({
            roundId: SEQUENCER_ROUND_ID,
            answer: 0,
            startedAt: SEQUENCER_STARTED_AT,
            updatedAt: SEQUENCER_UPDATED_AT,
            answeredInRound: SEQUENCER_ROUND_ID
        });
    }

    function held() internal pure returns (OracleStatePolicy.Input memory input) {
        input = live();
        input.registryPaused = true;
    }

    function staleInvalid() internal pure returns (OracleStatePolicy.Input memory input) {
        input = live();
        input.nowTs = input.price.updatedAt + BaseV1Constants.MAX_LIVE_AGE + 1;
    }

    function sequencerDown() internal pure returns (OracleStatePolicy.Input memory input) {
        input = live();
        input.sequencer.answer = 1;
        input.sequencer.startedAt = input.nowTs - 10_000;
    }

    function sequencerRecoveryGrace() internal pure returns (OracleStatePolicy.Input memory input) {
        input = live();
        input.sequencer.startedAt = input.nowTs - BaseV1Constants.SEQUENCER_GRACE_PERIOD;
    }

    function unpausedWithoutFreshPostHoldRound() internal pure returns (OracleStatePolicy.Input memory input) {
        input = live();
        input.hasPriorHold = true;
        input.heldRoundId = input.price.roundId;
        input.heldUpdatedAt = input.price.updatedAt;
    }

    function unpausedWithFreshPostHoldRound() internal pure returns (OracleStatePolicy.Input memory input) {
        input = live();
        input.hasPriorHold = true;
        input.heldRoundId = input.price.roundId - 1;
        input.heldUpdatedAt = input.price.updatedAt - 60;
    }
}
