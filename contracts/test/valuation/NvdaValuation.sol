// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {V1Config} from "../../src/V1Config.sol";

/// @title NvdaValuation
/// @notice Test-only reference for raw stock valuation against a total-return feed (8/8/6).
/// @dev Not production code. The feed answer is assumed to have passed the oracle policy's positive-answer checks.
///      Decimal invariant binds to `V1Config.VALUATION_DENOMINATOR`.
library NvdaValuation {
    uint8 internal constant STOCK_DECIMALS = V1Config.STOCK_DECIMALS;
    uint8 internal constant FEED_DECIMALS = V1Config.FEED_DECIMALS;
    uint8 internal constant USDC_DECIMALS = V1Config.USDC_DECIMALS;

    uint256 internal constant NORMALIZATION_DENOMINATOR = V1Config.VALUATION_DENOMINATOR;

    /// @notice Return raw USDC value, rounded down to the nearest USDC base unit.
    /// @dev Floor rounding is conservative for lender-risk checks because it never overstates collateral NAV.
    /// The Coinbase/Chainlink answer already includes the B20 multiplier, so this function intentionally has no
    /// multiplier input. Math.mulDiv preserves full intermediate precision even when stockAmountRaw * feedAnswer
    /// exceeds uint256.
    function toUsdcRawFloor(uint256 stockAmountRaw, uint256 feedAnswer) internal pure returns (uint256) {
        return Math.mulDiv(stockAmountRaw, feedAnswer, NORMALIZATION_DENOMINATOR, Math.Rounding.Floor);
    }
}
