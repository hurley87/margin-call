// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";
import {ICoinbaseOracleRegistry} from "./interfaces/ICoinbaseOracleRegistry.sol";
import {IOracleAdapter} from "./interfaces/IOracleAdapter.sol";
import {OracleStatePolicy} from "./OracleStatePolicy.sol";
import {V1Config} from "./V1Config.sol";

/// @title OracleAdapter
/// @notice Stateful Coinbase/Chainlink total-return adapter with fail-closed Base sequencer checks.
/// @dev One instance per supported stock. Classification itself lives in `OracleStatePolicy`; this contract only
///      fetches rounds and persists the observed hold. Reading (`latestObservation`) is a pure view and never
///      writes, because a caller that rejects a non-`LIVE` observation reverts — which would roll back any write
///      made on its behalf. Recording a hold is therefore a separate, permissionless, committing call (`refresh`).
contract OracleAdapter is IOracleAdapter {
    error ZeroAddress();

    event HoldObserved(uint80 heldRoundId, uint256 heldUpdatedAt);

    address public immutable override STOCK;
    IAggregatorV3 public immutable FEED;
    ICoinbaseOracleRegistry public immutable REGISTRY;
    IAggregatorV3 public immutable SEQUENCER_FEED;

    bool public hasObservedHold;
    uint80 public heldRoundId;
    uint256 public heldUpdatedAt;

    /// @notice When `refresh` last committed an observation. Zero until the first one.
    uint256 public lastRefreshedAt;

    constructor(address stock_, address feed_, address registry_, address sequencerFeed_) {
        if (stock_ == address(0) || feed_ == address(0) || registry_ == address(0) || sequencerFeed_ == address(0)) {
            revert ZeroAddress();
        }
        STOCK = stock_;
        FEED = IAggregatorV3(feed_);
        REGISTRY = ICoinbaseOracleRegistry(registry_);
        SEQUENCER_FEED = IAggregatorV3(sequencerFeed_);
    }

    /// @inheritdoc IOracleAdapter
    function latestObservation() external view override returns (Observation memory observation) {
        (OracleStatePolicy.Input memory input,) = _fetch();
        return _observe(input);
    }

    /// @inheritdoc IOracleAdapter
    /// @dev Permissionless: any actor may commit an observation, and a hold must be committed by some transaction
    ///      that succeeds for the post-hold freshness rule to bind. A rejected open cannot do it.
    function refresh() external override returns (Observation memory observation) {
        (OracleStatePolicy.Input memory input, bool feedRead) = _fetch();
        observation = _observe(input);
        lastRefreshedAt = block.timestamp;

        if (observation.state != State.HELD || !feedRead) {
            return observation;
        }

        uint80 roundId = input.price.roundId;
        uint256 updatedAt = input.price.updatedAt;
        if (!hasObservedHold || roundId > heldRoundId || updatedAt > heldUpdatedAt) {
            hasObservedHold = true;
            heldRoundId = roundId;
            heldUpdatedAt = updatedAt;
            emit HoldObserved(roundId, updatedAt);
        }
    }

    /// @inheritdoc IOracleAdapter
    function valueUsdc(uint256 stockAmountRaw, uint256 feedAnswer) external pure override returns (uint256) {
        return Math.mulDiv(stockAmountRaw, feedAnswer, V1Config.VALUATION_DENOMINATOR, Math.Rounding.Floor);
    }

    /// @dev Classify, and surface the fetched round on every state so callers can log or inspect a rejection.
    function _observe(OracleStatePolicy.Input memory input) private pure returns (Observation memory observation) {
        observation.state = OracleStatePolicy.classify(input);
        observation.price = input.price.answer > 0 ? uint256(input.price.answer) : 0;
        observation.roundId = input.price.roundId;
        observation.updatedAt = input.price.updatedAt;
    }

    /// @dev Read the registry, price feed, and sequencer feed, failing closed on any revert. `feedRead` reports
    ///      whether the price round is real data rather than the zero-value default.
    function _fetch() private view returns (OracleStatePolicy.Input memory input, bool feedRead) {
        input.nowTs = block.timestamp;
        input.hasPriorHold = hasObservedHold;
        input.heldRoundId = heldRoundId;
        input.heldUpdatedAt = heldUpdatedAt;

        try REGISTRY.getOracleParams(STOCK) returns (uint256, bool paused) {
            input.registryOk = true;
            input.registryPaused = paused;
        } catch {
            return (input, false);
        }

        try FEED.latestRoundData() returns (
            uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound
        ) {
            input.feedOk = true;
            feedRead = true;
            input.price = OracleStatePolicy.RoundData({
                roundId: roundId,
                answer: answer,
                startedAt: startedAt,
                updatedAt: updatedAt,
                answeredInRound: answeredInRound
            });
        } catch {}

        try SEQUENCER_FEED.latestRoundData() returns (
            uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound
        ) {
            input.sequencerOk = true;
            input.sequencer = OracleStatePolicy.RoundData({
                roundId: roundId,
                answer: answer,
                startedAt: startedAt,
                updatedAt: updatedAt,
                answeredInRound: answeredInRound
            });
        } catch {}
    }
}
