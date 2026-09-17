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

    /// @notice Fetch and classify. A pure view: it never persists, so a caller that rejects a non-`LIVE`
    ///         observation cannot roll back the record of what it saw.
    function latestObservation() external view returns (Observation memory observation);

    /// @notice Fetch, classify, and persist held-round recovery state. Permissionless.
    /// @dev The post-hold freshness rule only binds once a hold has been committed by a transaction that
    ///      succeeds, so an operator must call this across a registry pause.
    function refresh() external returns (Observation memory observation);

    /// @notice Value raw NVDAc against a positive total-return feed answer into raw USDC (floor).
    function valueUsdc(uint256 stockAmountRaw, uint256 feedAnswer) external view returns (uint256);
}
