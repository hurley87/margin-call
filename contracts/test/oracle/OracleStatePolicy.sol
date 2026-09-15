// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {BaseV1Constants} from "../fixtures/BaseV1Constants.sol";

/// @title OracleStatePolicy
/// @notice Test-only reference for issue #420 `LIVE` / `HELD` / `INVALID` classification.
/// @dev Not `OracleAdapter`. Not deployed. Do not import from `contracts/src`.
library OracleStatePolicy {
    /// @dev 8 hours. See `contracts/fork/README.md` for the Base-mainnet cadence evidence.
    uint256 internal constant MAX_LIVE_AGE = BaseV1Constants.MAX_LIVE_AGE;

    /// @dev Chainlink's published Base sequencer example uses 3600 seconds and `<=` to fail closed.
    /// https://docs.chain.link/data-feeds/l2-sequencer-feeds
    uint256 internal constant SEQUENCER_GRACE_PERIOD = BaseV1Constants.SEQUENCER_GRACE_PERIOD;

    enum State {
        LIVE,
        HELD,
        INVALID
    }

    struct RoundData {
        uint80 roundId;
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
        uint80 answeredInRound;
    }

    struct Input {
        bool feedOk;
        bool registryOk;
        bool sequencerOk;
        RoundData price;
        bool registryPaused;
        RoundData sequencer;
        uint256 nowTs;
        // Production OracleAdapter must persist an equivalent held round across
        // calls. This reference classifier is stateless and receives the prior
        // hold from the caller; it is not OracleAdapter.
        bool hasPriorHold;
        uint80 heldRoundId;
        uint256 heldUpdatedAt;
    }

    /// @notice Classify an already-fetched observation. Failed reads must set the `*Ok` flags.
    function classify(Input memory input) internal pure returns (State) {
        if (!input.registryOk) {
            return State.INVALID;
        }
        if (input.registryPaused) {
            return State.HELD;
        }
        if (!input.feedOk || !input.sequencerOk) {
            return State.INVALID;
        }

        if (!_sequencerAllowsLive(input.sequencer, input.nowTs)) {
            return State.INVALID;
        }
        if (!_priceRoundAllowsLive(input.price, input.nowTs)) {
            return State.INVALID;
        }
        if (input.hasPriorHold) {
            if (input.price.roundId <= input.heldRoundId || input.price.updatedAt <= input.heldUpdatedAt) {
                return State.INVALID;
            }
        }
        return State.LIVE;
    }

    function _sequencerAllowsLive(RoundData memory sequencer, uint256 nowTs) private pure returns (bool) {
        // 0 = up, 1 = down. Any other answer fails closed.
        if (sequencer.answer != 0) {
            return false;
        }
        if (sequencer.startedAt == 0 || nowTs < sequencer.startedAt) {
            return false;
        }
        if (nowTs - sequencer.startedAt <= SEQUENCER_GRACE_PERIOD) {
            return false;
        }
        return true;
    }

    function _priceRoundAllowsLive(RoundData memory price, uint256 nowTs) private pure returns (bool) {
        if (price.roundId == 0 || price.answeredInRound < price.roundId) {
            return false;
        }
        if (price.startedAt == 0 || price.updatedAt == 0 || price.updatedAt < price.startedAt) {
            return false;
        }
        if (price.updatedAt > nowTs || price.answer <= 0) {
            return false;
        }
        if (nowTs - price.updatedAt > MAX_LIVE_AGE) {
            return false;
        }
        return true;
    }
}
