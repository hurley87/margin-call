// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IOracleAdapter} from "../src/interfaces/IOracleAdapter.sol";
import {LaunchAssets} from "../src/LaunchAssets.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {V1Config} from "../src/V1Config.sol";
import {BaseV1Constants} from "../test/fixtures/BaseV1Constants.sol";
import {MarginCallForkBase} from "./MarginCallForkBase.sol";

/// @dev Compact open → reduce → repay → close smoke for each launch rail, plus mixed-asset isolation.
contract MultiStockForkSmokeTest is MarginCallForkBase {
    uint256 internal constant ONE_SHARE = 10 ** uint256(LaunchAssets.STOCK_DECIMALS);
    uint256 internal constant CONTRIBUTION = ONE_SHARE / 20; // 0.05 share

    uint256 internal nvdaId;
    uint256 internal aaplId;
    uint256 internal metaId;
    uint256 internal googlId;

    OracleAdapter internal nvdaOracle;
    OracleAdapter internal aaplOracle;
    OracleAdapter internal metaOracle;
    OracleAdapter internal googlOracle;

    function _forkActorLabel() internal pure override returns (string memory) {
        return "multi-stock-alice";
    }

    function setUp() public override {
        _selectFork();
        _initActors(_forkActorLabel());
        // Distinct admin/treasury labels for this suite.
        assetAdmin = makeAddr("multi-stock-admin");
        treasury = makeAddr("multi-stock-treasury");
        _deployForkStack();

        LaunchAssets.Asset[] memory rails = LaunchAssets.launchSet();
        (nvdaOracle, nvdaId) = _registerAsset(rails[0]);
        (aaplOracle, aaplId) = _registerAsset(rails[1]);
        (metaOracle, metaId) = _registerAsset(rails[2]);
        (googlOracle, googlId) = _registerAsset(rails[3]);
    }

    function test_nvdaCompactLifecycle() public {
        _compactLifecycle(LaunchAssets.launchSet()[0], nvdaId, nvdaOracle);
    }

    function test_aaplCompactLifecycle() public {
        _compactLifecycle(LaunchAssets.launchSet()[1], aaplId, aaplOracle);
    }

    function test_metaCompactLifecycle() public {
        _compactLifecycle(LaunchAssets.launchSet()[2], metaId, metaOracle);
    }

    function test_googlCompactLifecycle() public {
        _compactLifecycle(LaunchAssets.launchSet()[3], googlId, googlOracle);
    }

    function test_mixedAssetIsolation() public {
        LaunchAssets.Asset[] memory rails = LaunchAssets.launchSet();
        _fundFromPool(rails[0].stock, rails[0].pool, CONTRIBUTION);
        _fundFromPool(rails[1].stock, rails[1].pool, CONTRIBUTION);
        _fundFromPool(rails[2].stock, rails[2].pool, CONTRIBUTION);

        vm.startPrank(alice);
        IERC20(rails[0].stock).approve(address(marginCall), type(uint256).max);
        IERC20(rails[1].stock).approve(address(marginCall), type(uint256).max);
        IERC20(rails[2].stock).approve(address(marginCall), type(uint256).max);

        uint256 nvdaPos = marginCall.openPosition(nvdaId, CONTRIBUTION, V1Config.LEVERAGE_1_25X, 0);
        uint256 aaplPos = marginCall.openPosition(aaplId, CONTRIBUTION, V1Config.LEVERAGE_1_25X, 0);
        uint256 metaPos = marginCall.openPosition(metaId, CONTRIBUTION, V1Config.LEVERAGE_1_25X, 0);
        vm.stopPrank();

        uint256 nvdaStock = marginCall.positions(nvdaPos).stockAmount;
        uint256 aaplStock = marginCall.positions(aaplPos).stockAmount;
        uint256 metaStock = marginCall.positions(metaPos).stockAmount;
        uint256 nvdaCustodyBefore = IERC20(rails[0].stock).balanceOf(address(marginCall));
        uint256 aaplCustodyBefore = IERC20(rails[1].stock).balanceOf(address(marginCall));
        uint256 metaCustodyBefore = IERC20(rails[2].stock).balanceOf(address(marginCall));

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

        assertEq(marginCall.positions(nvdaPos).stockAmount, nvdaStock, "NVDA stock mutated");
        assertEq(marginCall.positions(metaPos).stockAmount, metaStock, "META stock mutated");
        assertEq(IERC20(rails[0].stock).balanceOf(address(marginCall)), nvdaCustodyBefore, "NVDA custody");
        assertEq(IERC20(rails[2].stock).balanceOf(address(marginCall)), metaCustodyBefore, "META custody");
        assertEq(IERC20(rails[1].stock).balanceOf(address(marginCall)), 0, "AAPL residual custody");
    }

    function _compactLifecycle(LaunchAssets.Asset memory rail, uint256 assetId, OracleAdapter railOracle) private {
        IOracleAdapter.Observation memory obs = railOracle.latestObservation();
        assertEq(uint8(obs.state), uint8(IOracleAdapter.State.LIVE));

        uint256 fair = railOracle.valueUsdc(CONTRIBUTION, obs.price);
        assertGt(fair, 0);

        _fundFromPool(rail.stock, rail.pool, CONTRIBUTION);
        deal(BaseV1Constants.USDC, alice, 50_000e6);

        vm.startPrank(alice);
        IERC20(rail.stock).approve(address(marginCall), type(uint256).max);
        IERC20(BaseV1Constants.USDC).approve(address(marginCall), type(uint256).max);

        uint256 tokenId = marginCall.openPosition(assetId, CONTRIBUTION, V1Config.LEVERAGE_1_25X, 0);
        assertEq(marginCall.positions(tokenId).assetId, assetId);
        assertGt(marginCall.positions(tokenId).stockAmount, CONTRIBUTION, "financed buy did not increase stock");
        assertGt(marginCall.positions(tokenId).principal, 0);

        uint256 stockAmount = marginCall.positions(tokenId).stockAmount;
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

        uint256 ownerBefore = IERC20(rail.stock).balanceOf(alice);
        uint256 remaining = marginCall.positions(tokenId).stockAmount;
        marginCall.closePosition(tokenId);
        vm.stopPrank();

        assertEq(IERC20(rail.stock).balanceOf(alice), ownerBefore + remaining);
        assertEq(IERC20(rail.stock).balanceOf(address(marginCall)), 0);
    }

    /// @dev Pull raw stock from the Uniswap pool address on this local fork only. Does not touch production.
    function _fundFromPool(address stock, address poolAddr, uint256 amount) private {
        uint256 poolBal = IERC20(stock).balanceOf(poolAddr);
        assertGe(poolBal, amount, "pool underfunded for demo");
        vm.prank(poolAddr);
        assertTrue(IERC20(stock).transfer(alice, amount));
    }
}
