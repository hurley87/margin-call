// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IRandomnessSource
/// @notice Injectable entropy for RipEngine Pack selection.
/// @dev V1 ships a disclosed House-seeded mock. Non-view so a real source can bump a nonce
///      or consume a beacon round. Replaced by verifiable randomness on any mainnet deploy.
interface IRandomnessSource {
    /// @notice Produce the next seed for a draw.
    /// @param salt Caller-chosen domain separator (e.g. rip count + resting length).
    /// @return seed Uniform-ish entropy for weighted selection.
    function nextSeed(bytes32 salt) external returns (uint256 seed);
}
