// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CreditPool} from "../src/CreditPool.sol";
import {ExecutionAdapter} from "../src/ExecutionAdapter.sol";
import {IOracleAdapter} from "../src/interfaces/IOracleAdapter.sol";
import {LaunchAssets} from "../src/LaunchAssets.sol";
import {MarginCall} from "../src/MarginCall.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {V1Config} from "../src/V1Config.sol";
import {BaseV1Constants} from "../test/fixtures/BaseV1Constants.sol";

/// @dev Compact open → reduce → repay → close smoke for each launch rail, plus mixed-asset isolation.
contract MultiStockForkSmokeTest is Test {
    uint256 internal constant BASE_BLOCK = BaseV1Constants.PINNED_BLOCK;
    uint256 internal constant ONE_SHARE = 10 ** uint256(LaunchAssets.STOCK_DECIMALS);
    uint256 internal constant CONTRIBUTION = ONE_SHARE / 20; // 0.05 share
    uint256 internal constant CREDIT_SEED = 500_000e6;

    MarginCall internal marginCall;
    CreditPool internal pool;
    address internal alice;
    address internal assetAdmin;
    address internal treasury;

    uint256 internal nvdaId;
    uint256 internal aaplId;
    uint256 internal metaId;
    uint256 internal googlId;

    OracleAdapter internal nvdaOracle;
    OracleAdapter internal aaplOracle;
    OracleAdapter internal metaOracle;
    OracleAdapter internal googlOracle;

    function setUp() public {
        vm.createSelectFork(vm.envString("BASE_MAINNET_RPC_URL"), BASE_BLOCK);
        alice = makeAddr("multi-stock-alice");
        assetAdmin = makeAddr("multi-stock-admin");
        treasury = makeAddr("multi-stock-treasury");
        vm.etch(alice, "");

        marginCall = new MarginCall(BaseV1Constants.USDC, assetAdmin);
        pool = new CreditPool(BaseV1Constants.USDC, address(marginCall), treasury);
        marginCall.setCreditPool(address(pool));
        deal(BaseV1Constants.USDC, address(pool), CREDIT_SEED);

        (nvdaOracle, nvdaId) = _register(
            LaunchAssets.NVDAC,
            LaunchAssets.NVDA_FEED,
            LaunchAssets.NVDA_UNISWAP_FEE,
            LaunchAssets.UNISWAP_USDC_NVDAC_POOL
        );
        (aaplOracle, aaplId) = _register(
            LaunchAssets.AAPLC,
            LaunchAssets.AAPL_FEED,
            LaunchAssets.AAPL_UNISWAP_FEE,
            LaunchAssets.UNISWAP_USDC_AAPLC_POOL
        );
        (metaOracle, metaId) = _register(
            LaunchAssets.METAC,
            LaunchAssets.META_FEED,
            LaunchAssets.META_UNISWAP_FEE,
            LaunchAssets.UNISWAP_USDC_METAC_POOL
        );
        (googlOracle, googlId) = _register(
            LaunchAssets.GOOGLC,
            LaunchAssets.GOOGL_FEED,
            LaunchAssets.GOOGL_UNISWAP_FEE,
            LaunchAssets.UNISWAP_USDC_GOOGLC_POOL
        );
    }

    function test_nvdaCompactLifecycle() public {
        _compactLifecycle(nvdaId, LaunchAssets.NVDAC, LaunchAssets.UNISWAP_USDC_NVDAC_POOL, nvdaOracle);
    }

    function test_aaplCompactLifecycle() public {
        _compactLifecycle(aaplId, LaunchAssets.AAPLC, LaunchAssets.UNISWAP_USDC_AAPLC_POOL, aaplOracle);
    }

    function test_metaCompactLifecycle() public {
        _compactLifecycle(metaId, LaunchAssets.METAC, LaunchAssets.UNISWAP_USDC_METAC_POOL, metaOracle);
    }

    function test_googlCompactLifecycle() public {
        _compactLifecycle(googlId, LaunchAssets.GOOGLC, LaunchAssets.UNISWAP_USDC_GOOGLC_POOL, googlOracle);
    }

    function test_mixedAssetIsolation() public {
        _fundFromPool(LaunchAssets.NVDAC, LaunchAssets.UNISWAP_USDC_NVDAC_POOL, CONTRIBUTION);
        _fundFromPool(LaunchAssets.AAPLC, LaunchAssets.UNISWAP_USDC_AAPLC_POOL, CONTRIBUTION);
        _fundFromPool(LaunchAssets.METAC, LaunchAssets.UNISWAP_USDC_METAC_POOL, CONTRIBUTION);

        vm.startPrank(alice);
        IERC20(LaunchAssets.NVDAC).approve(address(marginCall), type(uint256).max);
        IERC20(LaunchAssets.AAPLC).approve(address(marginCall), type(uint256).max);
        IERC20(LaunchAssets.METAC).approve(address(marginCall), type(uint256).max);

        uint256 nvdaPos = marginCall.openPosition(nvdaId, CONTRIBUTION, V1Config.LEVERAGE_1_25X, 0);
        uint256 aaplPos = marginCall.openPosition(aaplId, CONTRIBUTION, V1Config.LEVERAGE_1_25X, 0);
        uint256 metaPos = marginCall.openPosition(metaId, CONTRIBUTION, V1Config.LEVERAGE_1_25X, 0);
        vm.stopPrank();

        (, uint256 nvdaStock,,,,) = marginCall.positions(nvdaPos);
        (, uint256 aaplStock,,,,) = marginCall.positions(aaplPos);
        (, uint256 metaStock,,,,) = marginCall.positions(metaPos);
        uint256 nvdaCustodyBefore = IERC20(LaunchAssets.NVDAC).balanceOf(address(marginCall));
        uint256 aaplCustodyBefore = IERC20(LaunchAssets.AAPLC).balanceOf(address(marginCall));
        uint256 metaCustodyBefore = IERC20(LaunchAssets.METAC).balanceOf(address(marginCall));

        assertEq(nvdaCustodyBefore, nvdaStock);
        assertEq(aaplCustodyBefore, aaplStock);
        assertEq(metaCustodyBefore, metaStock);

        // Close the AAPL position after full repay — must not touch NVDA or META accounting.
        uint256 aaplDebt = marginCall.currentDebt(aaplPos);
        deal(BaseV1Constants.USDC, alice, aaplDebt);
        vm.startPrank(alice);
        IERC20(BaseV1Constants.USDC).approve(address(marginCall), aaplDebt);
        marginCall.repay(aaplPos, aaplDebt);
        marginCall.closePosition(aaplPos);
        vm.stopPrank();

        (, uint256 nvdaStockAfter,,,,) = marginCall.positions(nvdaPos);
        (, uint256 metaStockAfter,,,,) = marginCall.positions(metaPos);
        assertEq(nvdaStockAfter, nvdaStock, "NVDA stock mutated");
        assertEq(metaStockAfter, metaStock, "META stock mutated");
        assertEq(IERC20(LaunchAssets.NVDAC).balanceOf(address(marginCall)), nvdaCustodyBefore, "NVDA custody");
        assertEq(IERC20(LaunchAssets.METAC).balanceOf(address(marginCall)), metaCustodyBefore, "META custody");
        assertEq(IERC20(LaunchAssets.AAPLC).balanceOf(address(marginCall)), 0, "AAPL residual custody");
    }

    function _register(
        address stock,
        address feed,
        uint24 fee,
        address /* pool */
    )
        private
        returns (OracleAdapter oracle, uint256 assetId)
    {
        oracle = new OracleAdapter(
            stock, feed, BaseV1Constants.COINBASE_ORACLE_REGISTRY, BaseV1Constants.BASE_SEQUENCER_UPTIME_FEED
        );
        ExecutionAdapter execution =
            new ExecutionAdapter(BaseV1Constants.USDC, stock, BaseV1Constants.UNISWAP_SWAP_ROUTER_02, fee);
        vm.prank(assetAdmin);
        assetId = marginCall.addAsset(stock, address(oracle), address(execution));
    }

    function _compactLifecycle(uint256 assetId, address stock, address poolAddr, OracleAdapter oracle) private {
        IOracleAdapter.Observation memory obs = oracle.latestObservation();
        assertEq(uint8(obs.state), uint8(IOracleAdapter.State.LIVE));

        uint256 fair = oracle.valueUsdc(CONTRIBUTION, obs.price);
        assertGt(fair, 0);

        _fundFromPool(stock, poolAddr, CONTRIBUTION);
        deal(BaseV1Constants.USDC, alice, 50_000e6);

        vm.startPrank(alice);
        IERC20(stock).approve(address(marginCall), type(uint256).max);
        IERC20(BaseV1Constants.USDC).approve(address(marginCall), type(uint256).max);

        uint256 tokenId = marginCall.openPosition(assetId, CONTRIBUTION, V1Config.LEVERAGE_1_25X, 0);
        (uint256 recordedAsset, uint256 stockAmount, uint256 principal,,,) = marginCall.positions(tokenId);
        assertEq(recordedAsset, assetId);
        assertGt(stockAmount, CONTRIBUTION, "financed buy did not increase stock");
        assertGt(principal, 0);

        uint256 reduceSize = stockAmount / 10;
        if (reduceSize == 0) {
            reduceSize = 1;
        }
        marginCall.reduceExposure(tokenId, reduceSize, 0);

        uint256 debt = marginCall.currentDebt(tokenId);
        if (debt > 0) {
            // Top up USDC if reduce did not fully repay.
            uint256 bal = IERC20(BaseV1Constants.USDC).balanceOf(alice);
            if (bal < debt) {
                vm.stopPrank();
                deal(BaseV1Constants.USDC, alice, debt);
                vm.startPrank(alice);
                IERC20(BaseV1Constants.USDC).approve(address(marginCall), type(uint256).max);
            }
            marginCall.repay(tokenId, type(uint256).max);
        }
        assertEq(marginCall.currentDebt(tokenId), 0);

        uint256 ownerBefore = IERC20(stock).balanceOf(alice);
        (, uint256 remaining,,,,) = marginCall.positions(tokenId);
        marginCall.closePosition(tokenId);
        vm.stopPrank();

        assertEq(IERC20(stock).balanceOf(alice), ownerBefore + remaining);
        assertEq(IERC20(stock).balanceOf(address(marginCall)), 0);
    }

    /// @dev Pull raw stock from the Uniswap pool address on this local fork only. Does not touch production.
    function _fundFromPool(address stock, address poolAddr, uint256 amount) private {
        uint256 poolBal = IERC20(stock).balanceOf(poolAddr);
        assertGe(poolBal, amount, "pool underfunded for demo");
        vm.prank(poolAddr);
        assertTrue(IERC20(stock).transfer(alice, amount));
    }
}
