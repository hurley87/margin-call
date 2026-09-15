// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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

/// @dev Fork-only execution evidence for issue #420. This is not ExecutionAdapter.
contract NvdaExecutionRoutesTest is Test {
    uint256 internal constant BASE_BLOCK = 51_356_323;

    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant NVDAC = 0xb20000000000000000000078ee7ce2fE4908108C;
    address internal constant NVDA_HOLDER = 0xf8191D98ae98d2f7aBDFB63A9b0b812b93C873AA;

    address internal constant AERODROME_FACTORY = 0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef;
    address internal constant AERODROME_POOL = 0x853F5f1B92b16714Fe6CDA67CAad0856B83C7ab9;
    address internal constant AERODROME_QUOTER = 0x514c8B5f54112481E28028F1166Bd78501089259;
    address internal constant AERODROME_ROUTER = 0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F;
    int24 internal constant AERODROME_TICK_SPACING = 10;
    uint24 internal constant AERODROME_FEE = 500;

    address internal constant UNISWAP_FACTORY = 0x33128a8fC17869897dcE68Ed026d694621f6FDfD;
    address internal constant UNISWAP_POOL = 0x60661b315553EB81872deEA9a66d567Cf0CCd33B;
    address internal constant UNISWAP_QUOTER = 0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a;
    address internal constant UNISWAP_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;
    uint24 internal constant UNISWAP_FEE = 3000;

    uint256 internal constant PINNED_FEED_ANSWER = 21_178_500_000;
    int256 internal constant MIN_BUY_DEVIATION_BPS_X100 = 2_100;
    int256 internal constant MAX_BUY_DEVIATION_BPS_X100 = 2_200;
    int256 internal constant MIN_SELL_DEVIATION_BPS_X100 = -1_200;
    int256 internal constant MAX_SELL_DEVIATION_BPS_X100 = -1_100;

    function setUp() public {
        vm.createSelectFork(vm.envString("BASE_MAINNET_RPC_URL"), BASE_BLOCK);
    }

    function test_selectedDirectRouteAndPinnedPoolState() public view {
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

    function test_uniswapComparisonRouteAndPinnedPoolState() public view {
        IAerodromePool pool = IAerodromePool(UNISWAP_POOL);

        assertGt(UNISWAP_FACTORY.code.length, 0);
        assertGt(UNISWAP_ROUTER.code.length, 0);
        assertGt(UNISWAP_QUOTER.code.length, 0);
        assertGt(UNISWAP_POOL.code.length, 0);
        assertEq(IUniswapV3Factory(UNISWAP_FACTORY).getPool(USDC, NVDAC, UNISWAP_FEE), UNISWAP_POOL);
        assertEq(pool.factory(), UNISWAP_FACTORY);
        assertEq(pool.token0(), USDC);
        assertEq(pool.token1(), NVDAC);
        assertEq(pool.tickSpacing(), 60);
        assertEq(pool.fee(), UNISWAP_FEE);
        assertEq(pool.liquidity(), 117_332_603_442);
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

    function test_buyTenDollarsExecutes() public {
        _assertBuyExecution(10e6);
    }

    function test_buyFiftyDollarsExecutes() public {
        _assertBuyExecution(50e6);
    }

    function test_buyOneHundredDollarsExecutes() public {
        _assertBuyExecution(100e6);
    }

    function test_buyTwoHundredFiftyDollarsExecutes() public {
        _assertBuyExecution(250e6);
    }

    function test_sellApproximatelyTenDollarsExecutesRawUnits() public {
        _assertSellExecution(4_721_769);
    }

    function test_sellApproximatelyFiftyDollarsExecutesRawUnits() public {
        _assertSellExecution(23_608_848);
    }

    function test_sellApproximatelyOneHundredDollarsExecutesRawUnits() public {
        _assertSellExecution(47_217_697);
    }

    function test_sellApproximatelyTwoHundredFiftyDollarsExecutesRawUnits() public {
        _assertSellExecution(118_044_242);
    }

    function test_unrealisticallyTightMinOutReverts() public {
        uint256 amountIn = 100e6;
        deal(USDC, address(this), amountIn);
        assertTrue(IERC20(USDC).approve(AERODROME_ROUTER, amountIn));
        uint256 quote = _aerodromeQuote(USDC, NVDAC, amountIn);

        vm.expectRevert();
        IAerodromeSwapRouter(AERODROME_ROUTER).exactInputSingle(_swapParams(USDC, NVDAC, amountIn, quote + 1));
    }

    function _assertBuyExecution(uint256 amountIn) private {
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

    function _assertSellExecution(uint256 amountIn) private {
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

    function _deviationBpsX100(uint256 oracleFairValue, uint256 actualExecutionValue) private pure returns (int256) {
        int256 difference = int256(oracleFairValue) - int256(actualExecutionValue);
        return difference * 1_000_000 / int256(oracleFairValue);
    }
}
