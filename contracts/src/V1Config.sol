// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

/// @title V1Config
/// @notice Production Base V1 addresses and risk constants pinned by issue #420.
library V1Config {
    uint256 internal constant CHAIN_ID = 8453;

    address internal constant NVDAC = 0xb20000000000000000000078ee7ce2fE4908108C;
    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant NVDA_FEED = 0x04689a41629776563E6822F76f2e57D148d28513;
    address internal constant COINBASE_ORACLE_REGISTRY = 0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD;
    address internal constant BASE_SEQUENCER_UPTIME_FEED = 0xBCF85224fc0756B9Fa45aA7892530B47e10b6433;

    address internal constant UNISWAP_V3_FACTORY = 0x33128a8fC17869897dcE68Ed026d694621f6FDfD;
    address internal constant UNISWAP_SWAP_ROUTER_02 = 0x2626664c2603336E57B271c5C0b26F421741e481;
    address internal constant UNISWAP_QUOTER_V2 = 0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a;
    address internal constant UNISWAP_USDC_NVDAC_POOL = 0x60661b315553EB81872deEA9a66d567Cf0CCd33B;
    uint24 internal constant UNISWAP_FEE = 3000;

    uint8 internal constant NVDAC_DECIMALS = 8;
    uint8 internal constant NVDA_FEED_DECIMALS = 8;
    uint8 internal constant USDC_DECIMALS = 6;

    uint256 internal constant MAX_LIVE_AGE = 8 hours;
    uint256 internal constant SEQUENCER_GRACE_PERIOD = 3600;
    uint256 internal constant MAX_ORACLE_DEVIATION_BPS = 100;
    uint256 internal constant BPS_DENOMINATOR = 10_000;

    uint256 internal constant SPOT_LEVERAGE = 10_000;
    uint256 internal constant LEVERAGE_1_1X = 11_000;
    uint256 internal constant LEVERAGE_1_25X = 12_500;
    uint256 internal constant LEVERAGE_1_4X = 14_000;
    uint256 internal constant LEVERAGE_1_5X = 15_000;

    uint256 internal constant BORROW_APR_BPS = 1_000;
    uint256 internal constant MAINTENANCE_EQUITY_RATIO_BPS = 3_000;
    uint256 internal constant SECONDS_PER_YEAR = 365 days;

    /// @dev stockAmountRaw * feedAnswer * 10^6 / 10^8 / 10^8 = stockAmountRaw * feedAnswer / 10^10.
    uint256 internal constant VALUATION_DENOMINATOR =
        10 ** (uint256(NVDAC_DECIMALS) + uint256(NVDA_FEED_DECIMALS) - uint256(USDC_DECIMALS));
}
