// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BaseV1Constants} from "../test/fixtures/BaseV1Constants.sol";
import {ExecutionFixtures} from "../test/fixtures/ExecutionFixtures.sol";
import {OracleStatePolicy} from "../test/oracle/OracleStatePolicy.sol";
import {NvdaValuation} from "../test/valuation/NvdaValuation.sol";

interface IAerodromePoolFactory {
    function getPool(address tokenA, address tokenB, int24 tickSpacing) external view returns (address);
    function getSwapFee(address pool) external view returns (uint24);
    function isPool(address pool) external view returns (bool);
}

interface IAerodromePool {
    function factory() external view returns (address);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function tickSpacing() external view returns (int24);
    function fee() external view returns (uint24);
    function liquidity() external view returns (uint128);
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            bool unlocked
        );
}

interface IAerodromeQuoter {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        int24 tickSpacing;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
        external
        returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate);
}

interface IAerodromeSwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        int24 tickSpacing;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function factory() external view returns (address);
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IUniswapV3Quoter {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
        external
        returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate);
}

interface IUniswapV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address);
}

interface IUniswapV3Pool {
    function factory() external view returns (address);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
    function tickSpacing() external view returns (int24);
    function liquidity() external view returns (uint128);
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
}

/// @dev Exact deployed SwapRouter02 V3 ABI from Uniswap's IV3SwapRouter.
/// https://github.com/Uniswap/swap-router-contracts/blob/main/contracts/interfaces/IV3SwapRouter.sol
interface IUniswapV3SwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function factory() external view returns (address);
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IAggregatorV3 {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

interface ICoinbaseOracleRegistry {
    function getOracleParams(address token) external view returns (uint256 multiplier, bool paused);
}

/// @dev Fork-only execution evidence for issue #420. This is not ExecutionAdapter.
contract NvdaExecutionRoutesTest is Test {
    using OracleStatePolicy for OracleStatePolicy.Input;

    uint256 internal constant BASE_BLOCK = BaseV1Constants.PINNED_BLOCK;

    address internal constant USDC = BaseV1Constants.USDC;
    address internal constant NVDAC = BaseV1Constants.NVDAC;
    address internal constant NVDA_HOLDER = BaseV1Constants.PINNED_NVDAC_HOLDER;
    address internal constant NVDA_FEED = BaseV1Constants.NVDA_FEED;
    address internal constant ORACLE_REGISTRY = BaseV1Constants.COINBASE_ORACLE_REGISTRY;
    address internal constant SEQUENCER_FEED = BaseV1Constants.BASE_SEQUENCER_UPTIME_FEED;

    address internal constant AERODROME_FACTORY = 0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef;
    address internal constant AERODROME_POOL = 0x853F5f1B92b16714Fe6CDA67CAad0856B83C7ab9;
    address internal constant AERODROME_QUOTER = 0x514c8B5f54112481E28028F1166Bd78501089259;
    address internal constant AERODROME_ROUTER = 0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F;
    int24 internal constant AERODROME_TICK_SPACING = 10;
    uint24 internal constant AERODROME_FEE = 500;

    address internal constant UNISWAP_FACTORY = BaseV1Constants.UNISWAP_V3_FACTORY;
    address internal constant UNISWAP_POOL = BaseV1Constants.UNISWAP_USDC_NVDAC_POOL;
    address internal constant UNISWAP_QUOTER = BaseV1Constants.UNISWAP_QUOTER_V2;
    address internal constant UNISWAP_ROUTER = BaseV1Constants.UNISWAP_SWAP_ROUTER_02;
    uint24 internal constant UNISWAP_FEE = BaseV1Constants.UNISWAP_FEE;

    uint256 internal constant PINNED_FEED_ANSWER = BaseV1Constants.PINNED_FEED_ANSWER;
    int256 internal constant MAX_V1_ORACLE_DEVIATION_BPS_X100 =
        int256(BaseV1Constants.MAX_ORACLE_DEVIATION_BPS * 100);
    int256 internal constant MIN_BUY_DEVIATION_BPS_X100 = 2_100;
    int256 internal constant MAX_BUY_DEVIATION_BPS_X100 = 2_200;
    int256 internal constant MIN_SELL_DEVIATION_BPS_X100 = -1_200;
    int256 internal constant MAX_SELL_DEVIATION_BPS_X100 = -1_100;

    function setUp() public {
        vm.createSelectFork(vm.envString("BASE_MAINNET_RPC_URL"), BASE_BLOCK);
    }

    function test_aerodromeBenchmarkDirectRouteAndPinnedPoolState() public view {
        IAerodromePoolFactory factory = IAerodromePoolFactory(AERODROME_FACTORY);
        IAerodromePool pool = IAerodromePool(AERODROME_POOL);

        assertGt(AERODROME_FACTORY.code.length, 0);
        assertGt(AERODROME_ROUTER.code.length, 0);
        assertGt(AERODROME_QUOTER.code.length, 0);
        assertEq(NVDAC.code, hex"ef");
        assertGt(USDC.code.length, 0);

        assertTrue(factory.isPool(AERODROME_POOL));
        assertEq(factory.getPool(USDC, NVDAC, AERODROME_TICK_SPACING), AERODROME_POOL);
        assertEq(pool.factory(), AERODROME_FACTORY);
        assertEq(IAerodromeSwapRouter(AERODROME_ROUTER).factory(), AERODROME_FACTORY);
        assertEq(pool.token0(), USDC);
        assertEq(pool.token1(), NVDAC);
        assertEq(pool.tickSpacing(), AERODROME_TICK_SPACING);
        assertEq(pool.fee(), AERODROME_FEE);
        assertEq(factory.getSwapFee(AERODROME_POOL), AERODROME_FEE);
        assertEq(pool.liquidity(), 30_696_200_673_999);

        (uint160 sqrtPriceX96, int24 tick,,, uint16 observationCardinalityNext, bool unlocked) = pool.slot0();
        assertEq(sqrtPriceX96, 54_396_358_618_292_584_967_209_825_687);
        assertEq(tick, -7_522);
        assertEq(observationCardinalityNext, 2_048);
        assertTrue(unlocked);
        assertEq(IERC20(USDC).balanceOf(AERODROME_POOL), 633_202_641_509);
        assertEq(IERC20(NVDAC).balanceOf(AERODROME_POOL), 747_987_245_703);
    }

    function test_selectedUniswapDirectRouteAndPinnedPoolState() public view {
        IUniswapV3Pool pool = IUniswapV3Pool(UNISWAP_POOL);

        assertGt(UNISWAP_FACTORY.code.length, 0);
        assertGt(UNISWAP_ROUTER.code.length, 0);
        assertGt(UNISWAP_QUOTER.code.length, 0);
        assertGt(UNISWAP_POOL.code.length, 0);
        assertEq(IUniswapV3Factory(UNISWAP_FACTORY).getPool(USDC, NVDAC, UNISWAP_FEE), UNISWAP_POOL);
        assertEq(IUniswapV3SwapRouter(UNISWAP_ROUTER).factory(), UNISWAP_FACTORY);
        assertEq(pool.factory(), UNISWAP_FACTORY);
        assertEq(pool.token0(), USDC);
        assertEq(pool.token1(), NVDAC);
        assertEq(pool.tickSpacing(), 60);
        assertEq(pool.fee(), UNISWAP_FEE);
        assertEq(pool.liquidity(), 117_332_603_442);
        (uint160 sqrtPriceX96, int24 tick,,,,, bool unlocked) = pool.slot0();
        assertEq(sqrtPriceX96, 54_453_769_713_070_014_786_430_184_762);
        assertEq(tick, -7_500);
        assertTrue(unlocked);
        assertEq(IERC20(USDC).balanceOf(UNISWAP_POOL), 10_841_574_687);
        assertEq(IERC20(NVDAC).balanceOf(UNISWAP_POOL), 5_522_489_748);
    }

    function test_aerodromeQuotesBeatUniswapAtAllDemoSizes() public {
        uint256[4] memory usdcInputs = [uint256(10e6), 50e6, 100e6, 250e6];
        uint256[4] memory nvdaInputs = [uint256(4_721_769), 23_608_848, 47_217_697, 118_044_242];

        for (uint256 i = 0; i < usdcInputs.length; i++) {
            uint256 aerodromeBuy = _aerodromeQuote(USDC, NVDAC, usdcInputs[i]);
            uint256 uniswapBuy = _uniswapQuote(USDC, NVDAC, usdcInputs[i]);
            assertGt(aerodromeBuy, uniswapBuy);

            uint256 aerodromeSell = _aerodromeQuote(NVDAC, USDC, nvdaInputs[i]);
            uint256 uniswapSell = _uniswapQuote(NVDAC, USDC, nvdaInputs[i]);
            assertGt(aerodromeSell, uniswapSell);
        }
    }

    function test_aerodromeBenchmarkBuyTenDollarsExecutes() public {
        _assertAerodromeBuyExecution(10e6);
    }

    function test_aerodromeBenchmarkBuyFiftyDollarsExecutes() public {
        _assertAerodromeBuyExecution(50e6);
    }

    function test_aerodromeBenchmarkBuyOneHundredDollarsExecutes() public {
        _assertAerodromeBuyExecution(100e6);
    }

    function test_aerodromeBenchmarkBuyTwoHundredFiftyDollarsExecutes() public {
        _assertAerodromeBuyExecution(250e6);
    }

    function test_aerodromeBenchmarkSellApproximatelyTenDollarsExecutesRawUnits() public {
        _assertAerodromeSellExecution(4_721_769);
    }

    function test_aerodromeBenchmarkSellApproximatelyFiftyDollarsExecutesRawUnits() public {
        _assertAerodromeSellExecution(23_608_848);
    }

    function test_aerodromeBenchmarkSellApproximatelyOneHundredDollarsExecutesRawUnits() public {
        _assertAerodromeSellExecution(47_217_697);
    }

    function test_aerodromeBenchmarkSellApproximatelyTwoHundredFiftyDollarsExecutesRawUnits() public {
        _assertAerodromeSellExecution(118_044_242);
    }

    function test_uniswapBuyTenDollarsExecutes() public {
        _assertUniswapBuyExecution(10e6, 4_709_509);
    }

    function test_uniswapBuyFiftyDollarsExecutes() public {
        _assertUniswapBuyExecution(50e6, 23_544_184);
    }

    function test_uniswapBuyOneHundredDollarsExecutes() public {
        _assertUniswapBuyExecution(100e6, 47_079_948);
    }

    function test_uniswapBuyTwoHundredFiftyDollarsExecutes() public {
        _assertUniswapBuyExecution(250e6, 117_636_750);
    }

    function test_uniswapSellApproximatelyTenDollarsExecutesRawUnits() public {
        _assertUniswapSellExecution(4_721_769, 9_965_010);
    }

    function test_uniswapSellApproximatelyFiftyDollarsExecutesRawUnits() public {
        _assertUniswapSellExecution(23_608_848, 49_813_432);
    }

    function test_uniswapSellApproximatelyOneHundredDollarsExecutesRawUnits() public {
        _assertUniswapSellExecution(47_217_697, 99_597_805);
    }

    function test_uniswapSellApproximatelyTwoHundredFiftyDollarsExecutesRawUnits() public {
        _assertUniswapSellExecution(118_044_242, 248_776_805);
    }

    function test_aerodromeBenchmarkUnrealisticallyTightMinOutReverts() public {
        uint256 amountIn = 100e6;
        deal(USDC, address(this), amountIn);
        assertTrue(IERC20(USDC).approve(AERODROME_ROUTER, amountIn));
        uint256 quote = _aerodromeQuote(USDC, NVDAC, amountIn);

        vm.expectRevert();
        IAerodromeSwapRouter(AERODROME_ROUTER).exactInputSingle(_swapParams(USDC, NVDAC, amountIn, quote + 1));
    }

    function test_uniswapBuyTighterThanExecutableMinOutReverts() public {
        uint256 amountIn = 100e6;
        deal(USDC, address(this), amountIn);
        assertTrue(IERC20(USDC).approve(UNISWAP_ROUTER, amountIn));
        uint256 quote = _uniswapQuote(USDC, NVDAC, amountIn);
        uint256 nvdaBefore = IERC20(NVDAC).balanceOf(address(this));

        vm.expectRevert(abi.encodeWithSignature("Error(string)", "Too little received"));
        IUniswapV3SwapRouter(UNISWAP_ROUTER).exactInputSingle(_uniswapSwapParams(USDC, NVDAC, amountIn, quote + 1));
        assertEq(IERC20(USDC).balanceOf(address(this)), amountIn);
        assertEq(IERC20(NVDAC).balanceOf(address(this)), nvdaBefore);
    }

    function test_uniswapSellTighterThanExecutableMinOutReverts() public {
        uint256 amountIn = 47_217_697;
        vm.prank(NVDA_HOLDER);
        assertTrue(IERC20(NVDAC).transfer(address(this), amountIn));
        assertTrue(IERC20(NVDAC).approve(UNISWAP_ROUTER, amountIn));
        uint256 quote = _uniswapQuote(NVDAC, USDC, amountIn);
        uint256 usdcBefore = IERC20(USDC).balanceOf(address(this));

        vm.expectRevert(abi.encodeWithSignature("Error(string)", "Too little received"));
        IUniswapV3SwapRouter(UNISWAP_ROUTER).exactInputSingle(_uniswapSwapParams(NVDAC, USDC, amountIn, quote + 1));
        assertEq(IERC20(NVDAC).balanceOf(address(this)), amountIn);
        assertEq(IERC20(USDC).balanceOf(address(this)), usdcBefore);
    }

    function test_uniswapHistoricalMondayLiveQuotesRemainWithinV1Bound() public {
        _assertHistoricalUniswapQuotes(51_314_900, 1_789_419_147, 117_550_642, 249_050_711);
    }

    function test_uniswapHistoricalTuesdayOpenLiveQuotesRemainWithinV1Bound() public {
        _assertHistoricalUniswapQuotes(51_345_000, 1_789_479_347, 116_898_055, 250_440_186);
    }

    function test_uniswapHistoricalTuesdayLaterLiveQuotesRemainWithinV1Bound() public {
        _assertHistoricalUniswapQuotes(51_351_200, 1_789_491_747, 117_600_276, 248_898_525);
    }

    function _assertAerodromeBuyExecution(uint256 amountIn) private {
        deal(USDC, address(this), amountIn);
        assertTrue(IERC20(USDC).approve(AERODROME_ROUTER, amountIn));
        uint256 quote = _aerodromeQuote(USDC, NVDAC, amountIn);
        uint256 usdcBefore = IERC20(USDC).balanceOf(address(this));
        uint256 nvdaBefore = IERC20(NVDAC).balanceOf(address(this));

        uint256 amountOut =
            IAerodromeSwapRouter(AERODROME_ROUTER).exactInputSingle(_swapParams(USDC, NVDAC, amountIn, 0));

        assertEq(amountOut, quote);
        assertEq(usdcBefore - IERC20(USDC).balanceOf(address(this)), amountIn);
        assertEq(IERC20(NVDAC).balanceOf(address(this)) - nvdaBefore, amountOut);
        uint256 actualExecutionValue = NvdaValuation.toUsdcRawFloor(amountOut, PINNED_FEED_ANSWER);
        int256 deviation = _deviationBpsX100(amountIn, actualExecutionValue);
        assertGe(deviation, MIN_BUY_DEVIATION_BPS_X100);
        assertLe(deviation, MAX_BUY_DEVIATION_BPS_X100);
    }

    function _assertAerodromeSellExecution(uint256 amountIn) private {
        // Existing holder funds raw NVDAc through the deployed native B20 transfer path.
        // Impersonation affects only this local fork; no token/policy storage is modified.
        vm.prank(NVDA_HOLDER);
        assertTrue(IERC20(NVDAC).transfer(address(this), amountIn));
        assertTrue(IERC20(NVDAC).approve(AERODROME_ROUTER, amountIn));
        uint256 quote = _aerodromeQuote(NVDAC, USDC, amountIn);
        uint256 nvdaBefore = IERC20(NVDAC).balanceOf(address(this));
        uint256 usdcBefore = IERC20(USDC).balanceOf(address(this));

        uint256 amountOut =
            IAerodromeSwapRouter(AERODROME_ROUTER).exactInputSingle(_swapParams(NVDAC, USDC, amountIn, 0));

        assertEq(amountOut, quote);
        // Raw balanceOf delta, not scaledBalanceOf/UI units, is exactly the router input.
        assertEq(nvdaBefore - IERC20(NVDAC).balanceOf(address(this)), amountIn);
        assertEq(IERC20(USDC).balanceOf(address(this)) - usdcBefore, amountOut);
        uint256 oracleFairValue = NvdaValuation.toUsdcRawFloor(amountIn, PINNED_FEED_ANSWER);
        int256 deviation = _deviationBpsX100(oracleFairValue, amountOut);
        assertGe(deviation, MIN_SELL_DEVIATION_BPS_X100);
        assertLe(deviation, MAX_SELL_DEVIATION_BPS_X100);
    }

    function _assertUniswapBuyExecution(uint256 amountIn, uint256 expectedAmountOut) private {
        deal(USDC, address(this), amountIn);
        assertTrue(IERC20(USDC).approve(UNISWAP_ROUTER, amountIn));
        uint256 quote = _uniswapQuote(USDC, NVDAC, amountIn);
        uint256 usdcBefore = IERC20(USDC).balanceOf(address(this));
        uint256 nvdaBefore = IERC20(NVDAC).balanceOf(address(this));

        uint256 amountOut =
            IUniswapV3SwapRouter(UNISWAP_ROUTER).exactInputSingle(_uniswapSwapParams(USDC, NVDAC, amountIn, 0));

        assertEq(quote, expectedAmountOut);
        assertEq(amountOut, quote);
        assertEq(usdcBefore - IERC20(USDC).balanceOf(address(this)), amountIn);
        assertEq(IERC20(NVDAC).balanceOf(address(this)) - nvdaBefore, amountOut);
        uint256 actualExecutionValue = NvdaValuation.toUsdcRawFloor(amountOut, PINNED_FEED_ANSWER);
        int256 deviation = _deviationBpsX100(amountIn, actualExecutionValue);
        assertGe(deviation, 0);
        assertLe(deviation, MAX_V1_ORACLE_DEVIATION_BPS_X100);
        assertGe(amountOut, ExecutionFixtures.protocolMinNvdaOutForBuy(amountIn, PINNED_FEED_ANSWER));

        emit log_named_uint("Uniswap buy input USDC raw", amountIn);
        emit log_named_uint("Uniswap buy quote and actual NVDAc raw", amountOut);
        emit log_named_uint("Uniswap buy output oracle value USDC raw", actualExecutionValue);
        emit log_named_int("Uniswap buy total oracle deviation bps x100", deviation);
    }

    function _assertUniswapSellExecution(uint256 amountIn, uint256 expectedAmountOut) private {
        // Existing holder funds raw NVDAc through the deployed native B20 transfer path.
        vm.prank(NVDA_HOLDER);
        assertTrue(IERC20(NVDAC).transfer(address(this), amountIn));
        assertTrue(IERC20(NVDAC).approve(UNISWAP_ROUTER, amountIn));
        uint256 quote = _uniswapQuote(NVDAC, USDC, amountIn);
        uint256 nvdaBefore = IERC20(NVDAC).balanceOf(address(this));
        uint256 usdcBefore = IERC20(USDC).balanceOf(address(this));

        uint256 amountOut =
            IUniswapV3SwapRouter(UNISWAP_ROUTER).exactInputSingle(_uniswapSwapParams(NVDAC, USDC, amountIn, 0));

        assertEq(quote, expectedAmountOut);
        assertEq(amountOut, quote);
        assertEq(nvdaBefore - IERC20(NVDAC).balanceOf(address(this)), amountIn);
        assertEq(IERC20(USDC).balanceOf(address(this)) - usdcBefore, amountOut);
        uint256 oracleFairValue = NvdaValuation.toUsdcRawFloor(amountIn, PINNED_FEED_ANSWER);
        int256 deviation = _deviationBpsX100(oracleFairValue, amountOut);
        assertGe(deviation, 0);
        assertLe(deviation, MAX_V1_ORACLE_DEVIATION_BPS_X100);
        assertGe(amountOut, ExecutionFixtures.protocolMinUsdcOutForSell(amountIn, PINNED_FEED_ANSWER));

        emit log_named_uint("Uniswap sell input NVDAc raw", amountIn);
        emit log_named_uint("Uniswap sell input oracle value USDC raw", oracleFairValue);
        emit log_named_uint("Uniswap sell quote and actual USDC raw", amountOut);
        emit log_named_int("Uniswap sell total oracle deviation bps x100", deviation);
    }

    function _assertHistoricalUniswapQuotes(
        uint256 forkBlock,
        uint256 expectedTimestamp,
        uint256 expectedBuyOutput,
        uint256 expectedSellOutput
    ) private {
        vm.createSelectFork(vm.envString("BASE_MAINNET_RPC_URL"), forkBlock);
        assertEq(block.timestamp, expectedTimestamp);
        assertEq(IUniswapV3Factory(UNISWAP_FACTORY).getPool(USDC, NVDAC, UNISWAP_FEE), UNISWAP_POOL);

        OracleStatePolicy.Input memory observation = _oracleObservation();
        assertEq(uint256(observation.classify()), uint256(OracleStatePolicy.State.LIVE));

        uint256 buyInput = 250e6;
        uint256 buyOutput = _uniswapQuote(USDC, NVDAC, buyInput);
        uint256 buyOracleValue = NvdaValuation.toUsdcRawFloor(buyOutput, uint256(observation.price.answer));
        int256 buyDeviation = _deviationBpsX100(buyInput, buyOracleValue);

        uint256 sellInput = 118_044_242;
        uint256 sellOracleValue = NvdaValuation.toUsdcRawFloor(sellInput, uint256(observation.price.answer));
        uint256 sellOutput = _uniswapQuote(NVDAC, USDC, sellInput);
        int256 sellDeviation = _deviationBpsX100(sellOracleValue, sellOutput);

        assertEq(buyOutput, expectedBuyOutput);
        assertEq(sellOutput, expectedSellOutput);
        assertGe(buyDeviation, 0);
        assertLe(buyDeviation, MAX_V1_ORACLE_DEVIATION_BPS_X100);
        assertGe(sellDeviation, 0);
        assertLe(sellDeviation, MAX_V1_ORACLE_DEVIATION_BPS_X100);
        assertGe(
            buyOutput, ExecutionFixtures.protocolMinNvdaOutForBuy(buyInput, uint256(observation.price.answer))
        );
        assertGe(
            sellOutput, ExecutionFixtures.protocolMinUsdcOutForSell(sellInput, uint256(observation.price.answer))
        );

        emit log_named_uint("Historical Base block", forkBlock);
        emit log_named_uint("Historical block timestamp", block.timestamp);
        emit log_named_uint("Historical feed answer", uint256(observation.price.answer));
        emit log_named_uint("Historical feed age seconds", block.timestamp - observation.price.updatedAt);
        emit log_named_uint("Historical $250 buy quote NVDAc raw", buyOutput);
        emit log_named_int("Historical $250 buy total oracle deviation bps x100", buyDeviation);
        emit log_named_uint("Historical ~250 sale quote USDC raw", sellOutput);
        emit log_named_int("Historical ~250 sale total oracle deviation bps x100", sellDeviation);
    }

    function _aerodromeQuote(address tokenIn, address tokenOut, uint256 amountIn) private returns (uint256 amountOut) {
        (amountOut,,,) = IAerodromeQuoter(AERODROME_QUOTER)
            .quoteExactInputSingle(
                IAerodromeQuoter.QuoteExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: amountIn,
                tickSpacing: AERODROME_TICK_SPACING,
                sqrtPriceLimitX96: 0
            })
            );
    }

    function _uniswapQuote(address tokenIn, address tokenOut, uint256 amountIn) private returns (uint256 amountOut) {
        (amountOut,,,) = IUniswapV3Quoter(UNISWAP_QUOTER)
            .quoteExactInputSingle(
                IUniswapV3Quoter.QuoteExactInputSingleParams({
                tokenIn: tokenIn, tokenOut: tokenOut, amountIn: amountIn, fee: UNISWAP_FEE, sqrtPriceLimitX96: 0
            })
            );
    }

    function _swapParams(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMinimum)
        private
        view
        returns (IAerodromeSwapRouter.ExactInputSingleParams memory)
    {
        return IAerodromeSwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            tickSpacing: AERODROME_TICK_SPACING,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: amountIn,
            amountOutMinimum: amountOutMinimum,
            sqrtPriceLimitX96: 0
        });
    }

    function _uniswapSwapParams(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMinimum)
        private
        view
        returns (IUniswapV3SwapRouter.ExactInputSingleParams memory)
    {
        return IUniswapV3SwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: UNISWAP_FEE,
            recipient: address(this),
            amountIn: amountIn,
            amountOutMinimum: amountOutMinimum,
            sqrtPriceLimitX96: 0
        });
    }

    function _oracleObservation() private view returns (OracleStatePolicy.Input memory input) {
        input.feedOk = true;
        input.registryOk = true;
        input.sequencerOk = true;
        input.nowTs = block.timestamp;
        (
            input.price.roundId,
            input.price.answer,
            input.price.startedAt,
            input.price.updatedAt,
            input.price.answeredInRound
        ) = IAggregatorV3(NVDA_FEED).latestRoundData();
        (, input.registryPaused) = ICoinbaseOracleRegistry(ORACLE_REGISTRY).getOracleParams(NVDAC);
        (
            input.sequencer.roundId,
            input.sequencer.answer,
            input.sequencer.startedAt,
            input.sequencer.updatedAt,
            input.sequencer.answeredInRound
        ) = IAggregatorV3(SEQUENCER_FEED).latestRoundData();
    }

    function _deviationBpsX100(uint256 oracleFairValue, uint256 actualExecutionValue) private pure returns (int256) {
        int256 difference = int256(oracleFairValue) - int256(actualExecutionValue);
        return difference * 1_000_000 / int256(oracleFairValue);
    }
}
