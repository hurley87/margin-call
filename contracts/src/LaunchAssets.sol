// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

/// @title LaunchAssets
/// @notice Qualified launch-set token/feed/route pins for multi-stock Margin Call (issue #446).
/// @dev Used by tests and scripts only. Not imported by `MarginCall` — assets are registered at deploy time.
///
///      Launch set: NVDAc + AAPLc + METAc + GOOGLc.
///      TSLAc was excluded: the only USDC/TSLAc Uniswap pool (fee 10000) had zero liquidity at the shared pin
///      and at latest, so demo buys/sells cannot clear the shared 100 bps bound.
///      MSFTc was also tried as a replacement but Uniswap fills at $25–$100 demo size were worse than the
///      100 bps oracle floor; METAc at fee 3000 clears the bound. Prefer replacement over weakening the bound.
library LaunchAssets {
    address internal constant NVDAC = 0xb20000000000000000000078ee7ce2fE4908108C;
    address internal constant NVDA_FEED = 0x04689a41629776563E6822F76f2e57D148d28513;
    address internal constant UNISWAP_USDC_NVDAC_POOL = 0x60661b315553EB81872deEA9a66d567Cf0CCd33B;
    uint24 internal constant NVDA_UNISWAP_FEE = 3000;

    address internal constant AAPLC = 0xb200000000000000000000C2e324d24d7eEcd1fb;
    address internal constant AAPL_FEED = 0x787f13dEa48Db0897CbCDD985de77809D837F988;
    address internal constant UNISWAP_USDC_AAPLC_POOL = 0x97F35d1E92795327614BE000cd18cba1Be2c1931;
    uint24 internal constant AAPL_UNISWAP_FEE = 3000;

    /// @notice METAc replaces TSLAc in the launch set (TSLAc had no usable Uniswap liquidity).
    address internal constant METAC = 0xb2000000000000000000008bC8786B856E61707C;
    address internal constant META_FEED = 0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D;
    address internal constant UNISWAP_USDC_METAC_POOL = 0x583919ec1975a1238C50e1940911894ee6912476;
    uint24 internal constant META_UNISWAP_FEE = 3000;

    address internal constant GOOGLC = 0xb2000000000000000000002D0BA3164cc74f58B7;
    address internal constant GOOGL_FEED = 0x5bF49E0ffA937CE2FfF033c739aD7C634c4D34F2;
    /// @dev Fee-3000 clears the shared 100 bps bound at demo size; fee-10000 did not.
    address internal constant UNISWAP_USDC_GOOGLC_POOL = 0x8634EE4145A63E40E44e12A6Bb1B905Fcb8856a6;
    uint24 internal constant GOOGL_UNISWAP_FEE = 3000;

    uint8 internal constant STOCK_DECIMALS = 8;
    uint8 internal constant FEED_DECIMALS = 8;
}
