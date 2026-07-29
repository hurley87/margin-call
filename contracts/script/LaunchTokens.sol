// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title LaunchTokens
/// @notice Canonical Robinhood testnet Stock Token launch set for deploy scripts.
/// @dev Single Solidity source of truth for AMZN/AMD/NFLX/PLTR/TSLA. Keep the human/app
///      mirror `deployments/robinhood-testnet.stock-tokens.json` aligned with `tokens()`.
library LaunchTokens {
    /// @notice The five approved testnet Stock Tokens (same order as the JSON map).
    function tokens() internal pure returns (address[] memory assets) {
        assets = new address[](5);
        assets[0] = 0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02; // AMZN
        assets[1] = 0x71178BAc73cBeb415514eB542a8995b82669778d; // AMD
        assets[2] = 0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93; // NFLX
        assets[3] = 0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0; // PLTR
        assets[4] = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E; // TSLA
    }

    /// @notice Ticker symbols parallel to `tokens()`.
    function symbols() internal pure returns (string[] memory names) {
        names = new string[](5);
        names[0] = "AMZN";
        names[1] = "AMD";
        names[2] = "NFLX";
        names[3] = "PLTR";
        names[4] = "TSLA";
    }

    /// @notice Illustrative 8-decimal USD seed prices for MockPriceFeed (admin can retune).
    function seedPrices8() internal pure returns (uint256[] memory prices) {
        prices = new uint256[](5);
        prices[0] = 185e8; // AMZN
        prices[1] = 160e8; // AMD
        prices[2] = 700e8; // NFLX
        prices[3] = 40e8; // PLTR
        prices[4] = 250e8; // TSLA
    }
}
