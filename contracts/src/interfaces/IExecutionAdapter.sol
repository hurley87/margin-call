// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Fixed Uniswap V3 USDC ↔ stock execution with oracle-relative floors.
interface IExecutionAdapter {
    function USDC() external view returns (IERC20);

    function STOCK() external view returns (IERC20);

    function buyStock(uint256 usdcAmountIn, uint256 callerMinOut, uint256 livePrice)
        external
        returns (uint256 amountOut);

    function sellStock(uint256 stockAmountIn, uint256 callerMinOut, uint256 livePrice)
        external
        returns (uint256 amountOut);

    function protocolMinStockOutForBuy(uint256 usdcAmountIn, uint256 livePrice) external pure returns (uint256);

    function protocolMinUsdcOutForSell(uint256 stockAmountIn, uint256 livePrice) external pure returns (uint256);
}
