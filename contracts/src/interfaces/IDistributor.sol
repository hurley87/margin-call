// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IDistributor
/// @notice RipEngine → Distributor bookkeeping surface for on-chain emissions and rewards.
interface IDistributor {
    /// @notice Enroll a Pack for continuous Maker Emissions.
    function onPackEntered(uint256 tokenId, address maker) external;

    /// @notice Crystallize and drop a Pack from Maker Emissions (exit, purge, or Rip).
    function onPackExited(uint256 tokenId) external;

    /// @notice Record a successful Rip batch toward the current epoch's Participation Rewards.
    /// @param taker Account that receives the epoch share.
    /// @param count Packs ripped in the batch.
    function onRip(address taker, uint256 count) external;
}
