// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IPriceFeed
/// @notice Minimal price-feed surface consumed by AssetRegistry for Pack NAV.
/// @dev Chainlink-shaped enough for a TWAP/oracle adapter later; MockPriceFeed is the
///      V1 testnet / Foundry substitution point.
interface IPriceFeed {
    /// @notice Latest USD price for one whole token unit, scaled by `decimals()`.
    /// @dev Reverts or returns `valid = false` when the feed has no usable answer.
    /// @return price Price in feed decimals (e.g. 8 → $100 = 1e10).
    /// @return updatedAt Unix timestamp of the answer.
    /// @return paused True when the feed is deliberately halted (fail closed).
    /// @return valid False when the answer must not be consumed.
    function latestAnswer() external view returns (uint256 price, uint256 updatedAt, bool paused, bool valid);

    /// @notice Decimal places of `price` from `latestAnswer`.
    function decimals() external view returns (uint8);
}
