// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

/// @notice NVDAc total-return pricing and `LIVE` / `HELD` / `INVALID` classification.
interface IOracleAdapter {
    enum State {
        LIVE,
        HELD,
        INVALID
    }

    struct Observation {
        State state;
        uint256 price;
        uint80 roundId;
        uint256 updatedAt;
    }

    /// @notice Fetch, classify, and persist held-round recovery state. Not a pure view.
    function latestObservation() external returns (Observation memory observation);

    /// @notice Value raw NVDAc against a positive total-return feed answer into raw USDC (floor).
    function valueUsdc(uint256 stockAmountRaw, uint256 feedAnswer) external view returns (uint256);
}
