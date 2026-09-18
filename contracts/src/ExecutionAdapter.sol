// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IExecutionAdapter} from "./interfaces/IExecutionAdapter.sol";
import {IUniswapV3SwapRouter} from "./interfaces/IUniswapV3SwapRouter.sol";
import {V1Config} from "./V1Config.sol";

/// @title ExecutionAdapter
/// @notice Fixed Uniswap V3 Base USDC ↔ stock path with a 100 bps oracle-relative execution floor.
/// @dev One instance per supported stock. Aerodrome is intentionally not present.
///      Pulls exact input from `msg.sender` and delivers output to `msg.sender`. Protocol credit is gated by
///      `CreditPool` → `MarginCall`; this adapter never draws pool USDC itself.
contract ExecutionAdapter is IExecutionAdapter {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error InvalidLivePrice();

    IERC20 public immutable override USDC;
    IERC20 public immutable override STOCK;
    IUniswapV3SwapRouter public immutable ROUTER;
    uint24 public immutable FEE;

    constructor(address usdc_, address stock_, address router_, uint24 fee_) {
        if (usdc_ == address(0) || stock_ == address(0) || router_ == address(0)) {
            revert ZeroAddress();
        }
        USDC = IERC20(usdc_);
        STOCK = IERC20(stock_);
        ROUTER = IUniswapV3SwapRouter(router_);
        FEE = fee_;
    }

    /// @inheritdoc IExecutionAdapter
    function buyStock(uint256 usdcAmountIn, uint256 callerMinOut, uint256 livePrice)
        external
        override
        returns (uint256 amountOut)
    {
        if (usdcAmountIn == 0) {
            revert ZeroAmount();
        }

        uint256 minOut = Math.max(callerMinOut, protocolMinStockOutForBuy(usdcAmountIn, livePrice));
        USDC.safeTransferFrom(msg.sender, address(this), usdcAmountIn);
        USDC.forceApprove(address(ROUTER), usdcAmountIn);

        amountOut = ROUTER.exactInputSingle(
            IUniswapV3SwapRouter.ExactInputSingleParams({
                tokenIn: address(USDC),
                tokenOut: address(STOCK),
                fee: FEE,
                recipient: msg.sender,
                amountIn: usdcAmountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );
        USDC.forceApprove(address(ROUTER), 0);
    }

    /// @inheritdoc IExecutionAdapter
    function sellStock(uint256 stockAmountIn, uint256 callerMinOut, uint256 livePrice)
        external
        override
        returns (uint256 amountOut)
    {
        if (stockAmountIn == 0) {
            revert ZeroAmount();
        }

        uint256 minOut = Math.max(callerMinOut, protocolMinUsdcOutForSell(stockAmountIn, livePrice));
        STOCK.safeTransferFrom(msg.sender, address(this), stockAmountIn);
        STOCK.forceApprove(address(ROUTER), stockAmountIn);

        amountOut = ROUTER.exactInputSingle(
            IUniswapV3SwapRouter.ExactInputSingleParams({
                tokenIn: address(STOCK),
                tokenOut: address(USDC),
                fee: FEE,
                recipient: msg.sender,
                amountIn: stockAmountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );
        STOCK.forceApprove(address(ROUTER), 0);
    }

    /// @inheritdoc IExecutionAdapter
    function protocolMinStockOutForBuy(uint256 usdcAmountIn, uint256 livePrice) public pure override returns (uint256) {
        _validateLivePrice(livePrice);
        return Math.mulDiv(
            usdcAmountIn,
            V1Config.VALUATION_DENOMINATOR * V1Config.ADVERSE_BOUND_BPS,
            livePrice * V1Config.BPS_DENOMINATOR,
            Math.Rounding.Ceil
        );
    }

    /// @inheritdoc IExecutionAdapter
    function protocolMinUsdcOutForSell(uint256 stockAmountIn, uint256 livePrice)
        public
        pure
        override
        returns (uint256)
    {
        _validateLivePrice(livePrice);
        return Math.mulDiv(
            stockAmountIn,
            livePrice * V1Config.ADVERSE_BOUND_BPS,
            V1Config.VALUATION_DENOMINATOR * V1Config.BPS_DENOMINATOR,
            Math.Rounding.Ceil
        );
    }

    function _validateLivePrice(uint256 livePrice) private pure {
        if (livePrice == 0 || livePrice > type(uint256).max / V1Config.BPS_DENOMINATOR) {
            revert InvalidLivePrice();
        }
    }
}
