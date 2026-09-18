// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {BaseV1Constants} from "./BaseV1Constants.sol";

/// @title ExecutionFixtures
/// @notice Test-only reference helpers for the verified Base Uniswap execution rule.
/// @dev Not ExecutionAdapter. Inputs called `livePrice` must already satisfy OracleStatePolicy.
library ExecutionFixtures {
    error InvalidLivePrice();

    uint256 internal constant REPRESENTATIVE_USDC_BUY_INPUT = 100e6;
    uint256 internal constant REPRESENTATIVE_NVDAC_SELL_INPUT = 47_217_697;

    uint256 internal constant NORMALIZATION_DENOMINATOR = 10
        ** (uint256(BaseV1Constants.NVDAC_DECIMALS)
            + uint256(BaseV1Constants.NVDA_FEED_DECIMALS)
            - uint256(BaseV1Constants.USDC_DECIMALS));
    uint256 internal constant ADVERSE_BOUND_BPS =
        BaseV1Constants.BPS_DENOMINATOR - BaseV1Constants.MAX_ORACLE_DEVIATION_BPS;

    function isApprovedPair(address tokenIn, address tokenOut) internal pure returns (bool) {
        return (tokenIn == BaseV1Constants.USDC && tokenOut == BaseV1Constants.NVDAC)
            || (tokenIn == BaseV1Constants.NVDAC && tokenOut == BaseV1Constants.USDC);
    }

    function isApprovedFee(uint24 fee) internal pure returns (bool) {
        return fee == BaseV1Constants.UNISWAP_FEE;
    }

    /// @notice Apply the production rule: effectiveMinOut = max(callerMinOut, protocolOracleMinOut).
    function effectiveMinOut(uint256 callerMinOut, uint256 protocolOracleMinOut) internal pure returns (uint256) {
        return Math.max(callerMinOut, protocolOracleMinOut);
    }

    /// @notice Minimum raw NVDAc output for an exact-input USDC buy at the 100 bps adverse bound.
    /// @dev Rounds up so the accepted output cannot exceed the configured adverse deviation by a fractional raw unit.
    function protocolMinStockOutForBuy(uint256 usdcAmountIn, uint256 livePrice) internal pure returns (uint256) {
        _validateLivePrice(livePrice);
        return Math.mulDiv(
            usdcAmountIn,
            NORMALIZATION_DENOMINATOR * ADVERSE_BOUND_BPS,
            livePrice * BaseV1Constants.BPS_DENOMINATOR,
            Math.Rounding.Ceil
        );
    }

    /// @notice Minimum raw USDC output for an exact-input NVDAc sale at the 100 bps adverse bound.
    /// @dev Rounds up so the accepted output cannot exceed the configured adverse deviation by a fractional raw unit.
    function protocolMinUsdcOutForSell(uint256 nvdaAmountIn, uint256 livePrice) internal pure returns (uint256) {
        _validateLivePrice(livePrice);
        return Math.mulDiv(
            nvdaAmountIn,
            livePrice * ADVERSE_BOUND_BPS,
            NORMALIZATION_DENOMINATOR * BaseV1Constants.BPS_DENOMINATOR,
            Math.Rounding.Ceil
        );
    }

    function _validateLivePrice(uint256 livePrice) private pure {
        if (livePrice == 0 || livePrice > type(uint256).max / BaseV1Constants.BPS_DENOMINATOR) {
            revert InvalidLivePrice();
        }
    }
}
