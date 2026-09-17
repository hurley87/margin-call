// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {V1Config} from "../../src/V1Config.sol";

/// @title BaseV1Constants
/// @notice Test-only source of truth for Base V1 dependencies and verified risk parameters.
/// @dev Not production configuration. Values are pinned by issue #420 and mirror `V1Config`.
library BaseV1Constants {
    uint256 internal constant CHAIN_ID = V1Config.CHAIN_ID;

    address internal constant NVDAC = V1Config.NVDAC;
    address internal constant USDC = V1Config.USDC;
    address internal constant NVDA_FEED = V1Config.NVDA_FEED;
    address internal constant COINBASE_ORACLE_REGISTRY = V1Config.COINBASE_ORACLE_REGISTRY;
    address internal constant BASE_SEQUENCER_UPTIME_FEED = V1Config.BASE_SEQUENCER_UPTIME_FEED;

    address internal constant UNISWAP_V3_FACTORY = V1Config.UNISWAP_V3_FACTORY;
    address internal constant UNISWAP_SWAP_ROUTER_02 = V1Config.UNISWAP_SWAP_ROUTER_02;
    address internal constant UNISWAP_QUOTER_V2 = V1Config.UNISWAP_QUOTER_V2;
    address internal constant UNISWAP_USDC_NVDAC_POOL = V1Config.UNISWAP_USDC_NVDAC_POOL;
    uint24 internal constant UNISWAP_FEE = V1Config.UNISWAP_FEE;

    uint8 internal constant NVDAC_DECIMALS = V1Config.NVDAC_DECIMALS;
    uint8 internal constant NVDA_FEED_DECIMALS = V1Config.NVDA_FEED_DECIMALS;
    uint8 internal constant USDC_DECIMALS = V1Config.USDC_DECIMALS;

    uint256 internal constant MAX_LIVE_AGE = V1Config.MAX_LIVE_AGE;
    uint256 internal constant SEQUENCER_GRACE_PERIOD = V1Config.SEQUENCER_GRACE_PERIOD;
    uint256 internal constant MAX_ORACLE_DEVIATION_BPS = V1Config.MAX_ORACLE_DEVIATION_BPS;
    uint256 internal constant BPS_DENOMINATOR = V1Config.BPS_DENOMINATOR;

    // Reproducible verification snapshot. These are fixture observations, not mutable V1 policy.
    uint256 internal constant PINNED_BLOCK = 51_356_323;
    uint256 internal constant PINNED_TIMESTAMP = 1_789_501_993;
    uint256 internal constant PINNED_FEED_ANSWER = 21_178_500_000;
    address internal constant PINNED_NVDAC_HOLDER = 0xf8191D98ae98d2f7aBDFB63A9b0b812b93C873AA;
}
