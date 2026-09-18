// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {ExecutionAdapter} from "../../src/ExecutionAdapter.sol";
import {IOracleAdapter} from "../../src/interfaces/IOracleAdapter.sol";
import {MarginCall} from "../../src/MarginCall.sol";
import {BaseV1Constants} from "../fixtures/BaseV1Constants.sol";
import {MaintenanceFixtures} from "../fixtures/MaintenanceFixtures.sol";
import {MarginCallTestBase} from "./MarginCallTestBase.sol";
import {MockNvdaC, MockOracleAdapter} from "./PositionNftTestDoubles.sol";

/// @dev Positions in different assets must not share recorded stock or per-token custody.
contract MixedAssetIsolationTest is MarginCallTestBase {
    MockNvdaC internal stockB;
    MockNvdaC internal stockC;
    MockOracleAdapter internal oracleB;
    MockOracleAdapter internal oracleC;
    ExecutionAdapter internal executionB;
    ExecutionAdapter internal executionC;
    uint256 internal assetB;
    uint256 internal assetC;

    function setUp() public override {
        super.setUp();

        stockB = new MockNvdaC();
        stockC = new MockNvdaC();
        oracleB = new MockOracleAdapter(address(stockB));
        oracleC = new MockOracleAdapter(address(stockC));

        router.supportStock(address(stockB), BaseV1Constants.PINNED_FEED_ANSWER);
        router.supportStock(address(stockC), BaseV1Constants.PINNED_FEED_ANSWER);

        executionB = new ExecutionAdapter(address(usdc), address(stockB), address(router), BaseV1Constants.UNISWAP_FEE);
        executionC = new ExecutionAdapter(address(usdc), address(stockC), address(router), BaseV1Constants.UNISWAP_FEE);

        vm.startPrank(assetAdmin);
        assetB = marginCall.addAsset(address(stockB), address(oracleB), address(executionB));
        assetC = marginCall.addAsset(address(stockC), address(oracleC), address(executionC));
        vm.stopPrank();

        oracleB.setObservation(IOracleAdapter.State.LIVE, BaseV1Constants.PINNED_FEED_ANSWER, 1, OPENED_AT);
        oracleC.setObservation(IOracleAdapter.State.LIVE, BaseV1Constants.PINNED_FEED_ANSWER, 1, OPENED_AT);
    }

    function test_openManageCloseAcrossAssetsKeepsCustodyIsolated() public {
        _fund(alice, ONE_NVDAC);
        _fundStock(alice, stockB, ONE_NVDAC);
        _fundStock(bob, stockC, ONE_NVDAC);

        uint256 tokenA = _open(alice, ONE_NVDAC);
        vm.prank(alice);
        uint256 tokenB = marginCall.openPosition(assetB, ONE_NVDAC, SPOT_LEVERAGE, 0);
        vm.prank(bob);
        uint256 tokenC = marginCall.openPosition(assetC, ONE_NVDAC, LEVERAGE_1_25X, 0);

        MarginCall.Position memory posA = _position(tokenA);
        MarginCall.Position memory posB = _position(tokenB);
        MarginCall.Position memory posC = _position(tokenC);

        assertEq(posA.assetId, defaultAssetId);
        assertEq(posB.assetId, assetB);
        assertEq(posC.assetId, assetC);
        assertEq(posA.stockAmount, ONE_NVDAC);
        assertEq(posB.stockAmount, ONE_NVDAC);
        assertGt(posC.stockAmount, ONE_NVDAC);

        assertEq(nvdac.balanceOf(address(marginCall)), posA.stockAmount);
        assertEq(stockB.balanceOf(address(marginCall)), posB.stockAmount);
        assertEq(stockC.balanceOf(address(marginCall)), posC.stockAmount);

        // Close B: must not alter A or C recorded stock or custody.
        vm.prank(alice);
        marginCall.closePosition(tokenB);

        assertEq(_position(tokenA).stockAmount, posA.stockAmount);
        assertEq(_position(tokenC).stockAmount, posC.stockAmount);
        assertEq(nvdac.balanceOf(address(marginCall)), posA.stockAmount);
        assertEq(stockB.balanceOf(address(marginCall)), 0);
        assertEq(stockC.balanceOf(address(marginCall)), posC.stockAmount);
        assertEq(stockB.balanceOf(alice), ONE_NVDAC);
    }

    function test_reduceOneAssetLeavesOthersUntouched() public {
        _fund(alice, ONE_NVDAC);
        _fundStock(alice, stockB, ONE_NVDAC);

        uint256 tokenA = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        vm.prank(alice);
        uint256 tokenB = marginCall.openPosition(assetB, ONE_NVDAC, LEVERAGE_1_25X, 0);

        uint256 stockABefore = _position(tokenA).stockAmount;
        uint256 stockBBefore = _position(tokenB).stockAmount;
        uint256 custodyA = nvdac.balanceOf(address(marginCall));
        uint256 custodyB = stockB.balanceOf(address(marginCall));

        vm.prank(alice);
        marginCall.reduceExposure(tokenB, REDUCE_SALE, 0);

        assertEq(_position(tokenA).stockAmount, stockABefore);
        assertEq(_position(tokenB).stockAmount, stockBBefore - REDUCE_SALE);
        assertEq(nvdac.balanceOf(address(marginCall)), custodyA);
        assertEq(stockB.balanceOf(address(marginCall)), custodyB - REDUCE_SALE);
    }

    function test_liquidateOneAssetLeavesOthersUntouched() public {
        _fund(alice, ONE_NVDAC);
        _fundStock(bob, stockB, ONE_NVDAC);

        uint256 tokenA = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        vm.prank(bob);
        uint256 tokenB = marginCall.openPosition(assetB, ONE_NVDAC, LEVERAGE_1_25X, 0);

        uint256 stockA = _position(tokenA).stockAmount;
        MarginCall.Position memory posB = _position(tokenB);
        uint256 debtB = marginCall.currentDebt(tokenB);
        assertEq(debtB, posB.principal);

        // Crash only asset B's mark so B is liquidatable while A stays healthy at the pinned mark.
        uint256 crashPrice = MaintenanceFixtures.priceForDebtShare(posB.stockAmount, debtB, LIQUIDATABLE_DEBT_SHARE_BPS);
        oracleB.setObservation(IOracleAdapter.State.LIVE, crashPrice, 2, block.timestamp);
        router.setLivePrice(address(stockB), crashPrice);

        uint256 custodyA = nvdac.balanceOf(address(marginCall));
        uint256 navA = oracle.valueUsdc(stockA, BaseV1Constants.PINNED_FEED_ANSWER);
        assertTrue(_isHealthy(navA, marginCall.currentDebt(tokenA)));

        vm.prank(carol);
        marginCall.liquidate(tokenB);

        _assertTokenDoesNotExist(tokenB);
        assertEq(_position(tokenA).stockAmount, stockA);
        assertEq(nvdac.balanceOf(address(marginCall)), custodyA);
        assertEq(stockB.balanceOf(address(marginCall)), 0);
        assertEq(marginCall.ownerOf(tokenA), alice);
    }

    function _fundStock(address user, MockNvdaC stock, uint256 amount) private {
        stock.mint(user, amount);
        vm.prank(user);
        stock.approve(address(marginCall), type(uint256).max);
    }
}
