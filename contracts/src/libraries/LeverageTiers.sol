// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

/// @notice Single source of truth for the supported Arcade Leverage tiers.
library LeverageTiers {
    /// @notice Returns the six fixed Arcade Leverage tiers in ascending order.
    function all() internal pure returns (uint256[6] memory tiers) {
        tiers[0] = 12_500;
        tiers[1] = 15_000;
        tiers[2] = 20_000;
        tiers[3] = 30_000;
        tiers[4] = 50_000;
        tiers[5] = 100_000;
    }

    function isSupported(uint256 leverageBps) internal pure returns (bool) {
        uint256[6] memory tiers = all();
        for (uint256 i = 0; i < tiers.length; ++i) {
            if (tiers[i] == leverageBps) return true;
        }
        return false;
    }
}
