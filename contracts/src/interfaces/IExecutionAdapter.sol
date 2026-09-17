// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

/// @notice Fixed Uniswap V3 USDC ↔ NVDAc execution with oracle-relative floors.
interface IExecutionAdapter {
    function buyNvda(uint256 usdcAmountIn, uint256 callerMinOut, uint256 livePrice) external returns (uint256 amountOut);

    function sellNvda(uint256 nvdaAmountIn, uint256 callerMinOut, uint256 livePrice)
        external
        returns (uint256 amountOut);

    function protocolMinNvdaOutForBuy(uint256 usdcAmountIn, uint256 livePrice) external pure returns (uint256);

    function protocolMinUsdcOutForSell(uint256 nvdaAmountIn, uint256 livePrice) external pure returns (uint256);
}
