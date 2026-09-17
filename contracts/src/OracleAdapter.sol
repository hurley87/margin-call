// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";
import {ICoinbaseOracleRegistry} from "./interfaces/ICoinbaseOracleRegistry.sol";
import {IOracleAdapter} from "./interfaces/IOracleAdapter.sol";
import {V1Config} from "./V1Config.sol";

/// @title OracleAdapter
/// @notice Stateful Coinbase/Chainlink NVDAc total-return adapter with fail-closed Base sequencer checks.
contract OracleAdapter is IOracleAdapter {
    error ZeroAddress();

    address public immutable NVDAC;
    IAggregatorV3 public immutable NVDA_FEED;
    ICoinbaseOracleRegistry public immutable REGISTRY;
    IAggregatorV3 public immutable SEQUENCER_FEED;

    bool public hasObservedHold;
    uint80 public heldRoundId;
    uint256 public heldUpdatedAt;

    constructor(address nvdac_, address nvdaFeed_, address registry_, address sequencerFeed_) {
        if (nvdac_ == address(0) || nvdaFeed_ == address(0) || registry_ == address(0) || sequencerFeed_ == address(0))
        {
            revert ZeroAddress();
        }
        NVDAC = nvdac_;
        NVDA_FEED = IAggregatorV3(nvdaFeed_);
        REGISTRY = ICoinbaseOracleRegistry(registry_);
        SEQUENCER_FEED = IAggregatorV3(sequencerFeed_);
    }

    /// @inheritdoc IOracleAdapter
    function latestObservation() external override returns (Observation memory observation) {
        bool registryOk = true;
        bool registryPaused;
        try REGISTRY.getOracleParams(NVDAC) returns (uint256, bool paused) {
            registryPaused = paused;
        } catch {
            registryOk = false;
        }

        if (!registryOk) {
            observation.state = State.INVALID;
            return observation;
        }

        bool feedOk = true;
        uint80 roundId;
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
        uint80 answeredInRound;
        try NVDA_FEED.latestRoundData() returns (
            uint80 roundId_, int256 answer_, uint256 startedAt_, uint256 updatedAt_, uint80 answeredInRound_
        ) {
            roundId = roundId_;
            answer = answer_;
            startedAt = startedAt_;
            updatedAt = updatedAt_;
            answeredInRound = answeredInRound_;
        } catch {
            feedOk = false;
        }

        if (registryPaused) {
            if (feedOk && answer > 0) {
                observation.price = uint256(answer);
                observation.roundId = roundId;
                observation.updatedAt = updatedAt;
            }
            if (!hasObservedHold || roundId > heldRoundId || updatedAt > heldUpdatedAt) {
                hasObservedHold = true;
                heldRoundId = roundId;
                heldUpdatedAt = updatedAt;
            }
            observation.state = State.HELD;
            return observation;
        }

        bool sequencerOk = true;
        int256 sequencerAnswer;
        uint256 sequencerStartedAt;
        try SEQUENCER_FEED.latestRoundData() returns (uint80, int256 answer_, uint256 startedAt_, uint256, uint80) {
            sequencerAnswer = answer_;
            sequencerStartedAt = startedAt_;
        } catch {
            sequencerOk = false;
        }

        if (!feedOk || !sequencerOk) {
            observation.state = State.INVALID;
            return observation;
        }

        observation.price = answer > 0 ? uint256(answer) : 0;
        observation.roundId = roundId;
        observation.updatedAt = updatedAt;

        if (!_sequencerAllowsLive(sequencerAnswer, sequencerStartedAt, block.timestamp)) {
            observation.state = State.INVALID;
            return observation;
        }
        if (!_priceRoundAllowsLive(roundId, answer, startedAt, updatedAt, answeredInRound, block.timestamp)) {
            observation.state = State.INVALID;
            return observation;
        }
        if (hasObservedHold) {
            if (roundId <= heldRoundId || updatedAt <= heldUpdatedAt) {
                observation.state = State.INVALID;
                return observation;
            }
        }

        observation.state = State.LIVE;
    }

    /// @inheritdoc IOracleAdapter
    function valueUsdc(uint256 stockAmountRaw, uint256 feedAnswer) external pure override returns (uint256) {
        return Math.mulDiv(stockAmountRaw, feedAnswer, V1Config.VALUATION_DENOMINATOR, Math.Rounding.Floor);
    }

    function _sequencerAllowsLive(int256 answer, uint256 startedAt, uint256 nowTs) private pure returns (bool) {
        if (answer != 0) {
            return false;
        }
        if (startedAt == 0 || nowTs < startedAt) {
            return false;
        }
        if (nowTs - startedAt <= V1Config.SEQUENCER_GRACE_PERIOD) {
            return false;
        }
        return true;
    }

    function _priceRoundAllowsLive(
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound,
        uint256 nowTs
    ) private pure returns (bool) {
        if (roundId == 0 || answeredInRound < roundId) {
            return false;
        }
        if (startedAt == 0 || updatedAt == 0 || updatedAt < startedAt) {
            return false;
        }
        if (updatedAt > nowTs || answer <= 0) {
            return false;
        }
        if (nowTs - updatedAt > V1Config.MAX_LIVE_AGE) {
            return false;
        }
        return true;
    }
}
