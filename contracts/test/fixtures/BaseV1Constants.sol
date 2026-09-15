// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

/// @title BaseV1Constants
/// @notice Test-only source of truth for Base V1 dependencies and verified risk parameters.
/// @dev Not production configuration. Values are pinned by issue #420 and the Base fork suite.
library BaseV1Constants {
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

    // Reproducible verification snapshot. These are fixture observations, not mutable V1 policy.
    uint256 internal constant PINNED_BLOCK = 51_356_323;
    uint256 internal constant PINNED_TIMESTAMP = 1_789_501_993;
    uint256 internal constant PINNED_FEED_ANSWER = 21_178_500_000;
    address internal constant PINNED_NVDAC_HOLDER = 0xf8191D98ae98d2f7aBDFB63A9b0b812b93C873AA;
}
