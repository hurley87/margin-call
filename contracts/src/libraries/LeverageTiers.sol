// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

/// @notice Single source of truth for the supported Arcade Leverage tiers.
library LeverageTiers {
    function isSupported(uint256 leverageBps) internal pure returns (bool) {
        return leverageBps == 12_500 || leverageBps == 15_000 || leverageBps == 20_000 || leverageBps == 30_000
            || leverageBps == 50_000 || leverageBps == 100_000;
    }
}
