// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

/// @notice Single source of truth for the supported Arcade Leverage tiers.
library LeverageTiers {
    function isSupported(uint256 leverageBps) internal pure returns (bool) {
        return leverageBps == 12_500 || leverageBps == 15_000 || leverageBps == 20_000 || leverageBps == 30_000
            || leverageBps == 50_000 || leverageBps == 100_000;
    }

    /// @notice Returns the six fixed Arcade Leverage tiers in ascending order.
    function all() internal pure returns (uint256[6] memory tiers) {
        tiers[0] = 12_500;
        tiers[1] = 15_000;
        tiers[2] = 20_000;
        tiers[3] = 30_000;
        tiers[4] = 50_000;
        tiers[5] = 100_000;
    }
}
