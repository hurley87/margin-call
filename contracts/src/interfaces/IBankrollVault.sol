// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

/// @notice Game-facing BankrollVault surface used by MarginCallCrash.
interface IBankrollVault {
    function acceptEntry(
        uint256 roundId,
        uint256 ticketId,
        address player,
        uint256 margin,
        uint256 leverageBps,
        uint256 maximumPayout
    ) external;

    /// @notice Records an exposed round so share ops can freeze at reveal or expiry.
    /// @dev Called exactly once, on the round's first accepted ticket.
    function registerExposure(uint256 roundId, uint64 expiresAt) external;

    /// @notice Increments the reveal-window freeze for an already-registered exposed round.
    function noteRevealRequested(uint256 roundId) external;

    /// @notice Marks a round's result into share pricing before any claim.
    /// @dev Releases `totalMargin` from unrecognizedMargin and adds O(tiers) winning
    ///      liability at or below `crashPointBps` into pendingObligations.
    function markRoundFinalized(uint256 roundId, uint256 totalMargin, uint256 crashPointBps) external;

    /// @notice Pays a winning ticket and consumes its reservation.
    function payClaim(uint256 roundId, uint256 ticketId, address recipient, uint256 payout) external;

    /// @notice Releases a losing ticket's reservation without transferring tUSD.
    function settleLoss(uint256 roundId, uint256 ticketId) external;

    /// @notice Marks an expired round's margins into pending refund obligations.
    /// @dev Moves `totalMargin` from unrecognizedMargin to pendingObligations with no share-price change.
    function markRoundExpired(uint256 roundId, uint256 totalMargin) external;

    /// @notice Returns original margin to a ticket owner and consumes its reservation.
    function refundMargin(uint256 roundId, uint256 ticketId, address recipient, uint256 margin) external;
}
