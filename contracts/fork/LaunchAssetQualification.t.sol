// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {ExecutionAdapter} from "../src/ExecutionAdapter.sol";
import {ICoinbaseOracleRegistry} from "../src/interfaces/ICoinbaseOracleRegistry.sol";
import {IOracleAdapter} from "../src/interfaces/IOracleAdapter.sol";
import {LaunchAssets} from "../src/LaunchAssets.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {V1Config} from "../src/V1Config.sol";
import {BaseV1Constants} from "../test/fixtures/BaseV1Constants.sol";

interface IAggregatorV3Read {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

interface IUniswapV3FactoryRead {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

interface IUniswapV3PoolRead {
    function liquidity() external view returns (uint128);

    function fee() external view returns (uint24);
}

/// @dev Lightweight per-stock qualification for the multi-stock launch set (issue #446).
contract LaunchAssetQualificationTest is Test {
    uint256 internal constant BASE_BLOCK = BaseV1Constants.PINNED_BLOCK;
    uint256 internal constant DEMO_USDC = 100e6;
    uint256 internal constant DEMO_STOCK = 5e6;

    function setUp() public {
        vm.createSelectFork(vm.envString("BASE_MAINNET_RPC_URL"), BASE_BLOCK);
    }

    function test_launchRailsQualify() public {
        LaunchAssets.Asset[] memory rails = LaunchAssets.launchSet();
        for (uint256 i = 0; i < rails.length; ++i) {
            _qualify(rails[i]);
        }
    }

    function _qualify(LaunchAssets.Asset memory rail) private {
        OracleAdapter oracle = new OracleAdapter(
            rail.stock, rail.feed, BaseV1Constants.COINBASE_ORACLE_REGISTRY, BaseV1Constants.BASE_SEQUENCER_UPTIME_FEED
        );
        ExecutionAdapter execution =
            new ExecutionAdapter(BaseV1Constants.USDC, rail.stock, BaseV1Constants.UNISWAP_SWAP_ROUTER_02, rail.fee);

        _qualifyIdentity(rail, oracle);
        _qualifyRouteAndBound(rail, oracle, execution);
    }

    function _qualifyIdentity(LaunchAssets.Asset memory rail, OracleAdapter oracle) private {
        assertEq(rail.stock.code, hex"ef", string.concat(rail.name, " not native B20"));
        assertEq(IERC20Metadata(rail.stock).decimals(), LaunchAssets.STOCK_DECIMALS);

        (uint256 multiplier, bool paused) =
            ICoinbaseOracleRegistry(BaseV1Constants.COINBASE_ORACLE_REGISTRY).getOracleParams(rail.stock);
        assertFalse(paused, string.concat(rail.name, " registry paused"));
        assertGt(multiplier, 0);

        assertEq(IAggregatorV3Read(rail.feed).decimals(), LaunchAssets.FEED_DECIMALS);
        (, int256 answer,, uint256 updatedAt,) = IAggregatorV3Read(rail.feed).latestRoundData();
        assertGt(answer, 0);
        assertGt(updatedAt, 0);

        uint256 oneShare = 10 ** uint256(LaunchAssets.STOCK_DECIMALS);
        uint256 value = oracle.valueUsdc(oneShare, uint256(answer));
        assertEq(value, Math.mulDiv(oneShare, uint256(answer), V1Config.VALUATION_DENOMINATOR, Math.Rounding.Floor));
        // casting to 'uint256' is safe because Chainlink answers used here are positive (asserted above)
        // forge-lint: disable-next-line(unsafe-typecast)
        assertEq(value, uint256(answer) / 100, string.concat(rail.name, " no double B20"));
    }

    function _qualifyRouteAndBound(LaunchAssets.Asset memory rail, OracleAdapter oracle, ExecutionAdapter execution)
        private
    {
        address discovered =
            IUniswapV3FactoryRead(BaseV1Constants.UNISWAP_V3_FACTORY).getPool(BaseV1Constants.USDC, rail.stock, rail.fee);
        assertEq(discovered, rail.pool, string.concat(rail.name, " pool mismatch"));
        assertGt(IUniswapV3PoolRead(rail.pool).liquidity(), 0, string.concat(rail.name, " zero liquidity"));
        assertEq(IUniswapV3PoolRead(rail.pool).fee(), rail.fee);

        IOracleAdapter.Observation memory obs = oracle.latestObservation();
        assertEq(uint8(obs.state), uint8(IOracleAdapter.State.LIVE), string.concat(rail.name, " oracle not LIVE"));

        address trader = makeAddr(string.concat(rail.name, "-trader"));
        vm.etch(trader, "");
        deal(BaseV1Constants.USDC, trader, DEMO_USDC * 2);

        vm.startPrank(trader);
        IERC20(BaseV1Constants.USDC).approve(address(execution), type(uint256).max);
        uint256 bought = execution.buyStock(DEMO_USDC, 0, obs.price);
        assertGt(bought, 0);

        IERC20(rail.stock).approve(address(execution), type(uint256).max);
        uint256 saleSize = bought < DEMO_STOCK ? bought : DEMO_STOCK;
        uint256 floor = execution.protocolMinUsdcOutForSell(saleSize, obs.price);
        uint256 usdcOut = execution.sellStock(saleSize, 0, obs.price);
        vm.stopPrank();

        assertGt(usdcOut, 0);
        assertGe(usdcOut, floor, string.concat(rail.name, " bound"));
    }
}
