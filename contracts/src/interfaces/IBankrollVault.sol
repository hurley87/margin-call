// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

/// @notice Game-facing BankrollVault surface used by MarginCallCrash entry.
interface IBankrollVault {
    function acceptEntry(
        uint256 roundId,
        uint256 ticketId,
        address player,
        uint256 margin,
        uint256 leverageBps,
        uint256 maximumPayout
    ) external;
}
