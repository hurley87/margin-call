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

    /// @dev The adverse execution bound as a fraction of fair value in bps. Shared by the execution floor and the
    ///      opening-principal haircut so a swap that fills at the bound cannot breach the leverage preset.
    uint256 internal constant ADVERSE_BOUND_BPS = BPS_DENOMINATOR - MAX_ORACLE_DEVIATION_BPS;

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

    /// @notice The five V1 opening presets. The set lives here with the constants so the contract, the smoke
    ///         scripts, and the tests cannot enumerate it differently.
    function isSupportedOpeningLeverage(uint256 targetLeverage) internal pure returns (bool) {
        return targetLeverage == SPOT_LEVERAGE || isFinancedLeverage(targetLeverage);
    }

    /// @notice The financed subset: every supported preset above 1.0x.
    function isFinancedLeverage(uint256 targetLeverage) internal pure returns (bool) {
        return targetLeverage == LEVERAGE_1_1X || targetLeverage == LEVERAGE_1_25X || targetLeverage == LEVERAGE_1_4X
            || targetLeverage == LEVERAGE_1_5X;
    }

    /// @notice The V1 maintenance rule: healthy while equity is at least `MAINTENANCE_EQUITY_RATIO_BPS` of NAV.
    ///         Equality at the threshold is healthy. A debt-free position is healthy at any mark, including
    ///         `nav == 0`. The rule lives here with the constant, like the leverage presets above, so the
    ///         contract, the fork suite, and the RPC-free suite cannot encode the 30% threshold differently.
    /// @dev Both `nav == 0` and `debt >= nav` resolve before the subtraction, so equity never underflows.
    function isHealthy(uint256 nav, uint256 debt) internal pure returns (bool) {
        if (debt == 0) {
            return true;
        }
        if (nav == 0 || debt >= nav) {
            return false;
        }
        return (nav - debt) * BPS_DENOMINATOR >= nav * MAINTENANCE_EQUITY_RATIO_BPS;
    }

    /// @notice Exactly the negation of `isHealthy`. Stated separately because liquidation reads in this
    ///         direction and a reader should not have to invert the maintenance rule at the call site.
    function isLiquidatable(uint256 nav, uint256 debt) internal pure returns (bool) {
        return !isHealthy(nav, debt);
    }
}
