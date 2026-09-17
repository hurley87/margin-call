// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

/// @notice Minimal Chainlink Aggregator V3 reader used by `OracleAdapter`.
interface IAggregatorV3 {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}
