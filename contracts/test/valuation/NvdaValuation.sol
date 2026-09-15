// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title NvdaValuation
/// @notice Test-only reference for raw NVDAc valuation against its total-return feed.
/// @dev Not production code. The feed answer is assumed to have passed the oracle policy's positive-answer checks.
library NvdaValuation {
    uint8 internal constant STOCK_DECIMALS = 8;
    uint8 internal constant FEED_DECIMALS = 8;
    uint8 internal constant USDC_DECIMALS = 6;

    // stockAmountRaw * feedAnswer * 10^6 / 10^8 / 10^8
    // = stockAmountRaw * feedAnswer / 10^10.
    uint256 internal constant NORMALIZATION_DENOMINATOR =
        10 ** (uint256(STOCK_DECIMALS) + uint256(FEED_DECIMALS) - uint256(USDC_DECIMALS));

    /// @notice Return raw USDC value, rounded down to the nearest USDC base unit.
    /// @dev Floor rounding is conservative for lender-risk checks because it never overstates collateral NAV.
    /// The Coinbase/Chainlink answer already includes the B20 multiplier, so this function intentionally has no
    /// multiplier input. Math.mulDiv preserves full intermediate precision even when stockAmountRaw * feedAnswer
    /// exceeds uint256.
    function toUsdcRawFloor(uint256 stockAmountRaw, uint256 feedAnswer) internal pure returns (uint256) {
        return Math.mulDiv(stockAmountRaw, feedAnswer, NORMALIZATION_DENOMINATOR, Math.Rounding.Floor);
    }
}
