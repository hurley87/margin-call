// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {ExecutionAdapter} from "../../src/ExecutionAdapter.sol";
import {MarginCall} from "../../src/MarginCall.sol";
import {BaseV1Constants} from "../fixtures/BaseV1Constants.sol";
import {MarginCallTestBase} from "./MarginCallTestBase.sol";
import {MockNvdaC, MockOracleAdapter, MockSwapRouter, MockUsdc} from "./PositionNftTestDoubles.sol";

/// @dev Asset registry admin surface: registration gates, enumeration, and opening toggle.
contract AssetRegistryTest is MarginCallTestBase {
    function test_onlyAssetAdminCanAddAsset() public {
        MockNvdaC stock = new MockNvdaC();
        (MockOracleAdapter stockOracle, ExecutionAdapter stockExecution) = _adaptersFor(stock);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotAssetAdmin.selector, alice));
        marginCall.addAsset(address(stock), address(stockOracle), address(stockExecution));

        vm.prank(assetAdmin);
        uint256 assetId = marginCall.addAsset(address(stock), address(stockOracle), address(stockExecution));
        assertEq(assetId, 2);
        assertEq(marginCall.assetIdOf(address(stock)), 2);
    }

    function test_onlyAssetAdminCanSetOpeningEnabled() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotAssetAdmin.selector, alice));
        marginCall.setAssetOpeningEnabled(defaultAssetId, false);

        vm.prank(assetAdmin);
        marginCall.setAssetOpeningEnabled(defaultAssetId, false);
        assertFalse(marginCall.assetConfig(defaultAssetId).openingEnabled);

        vm.prank(assetAdmin);
        marginCall.setAssetOpeningEnabled(defaultAssetId, true);
        assertTrue(marginCall.assetConfig(defaultAssetId).openingEnabled);
    }

    function test_duplicateStockRejected() public {
        (MockOracleAdapter stockOracle, ExecutionAdapter stockExecution) = _adaptersFor(nvdac);

        vm.prank(assetAdmin);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.AssetAlreadyRegistered.selector, address(nvdac)));
        marginCall.addAsset(address(nvdac), address(stockOracle), address(stockExecution));
    }

    function test_reusedAdapterRejected() public {
        MockNvdaC stock = new MockNvdaC();
        (, ExecutionAdapter stockExecution) = _adaptersFor(stock);

        vm.prank(assetAdmin);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.AdapterAlreadyRegistered.selector, address(oracle)));
        marginCall.addAsset(address(stock), address(oracle), address(stockExecution));

        (MockOracleAdapter stockOracle,) = _adaptersFor(stock);
        vm.prank(assetAdmin);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.AdapterAlreadyRegistered.selector, address(execution)));
        marginCall.addAsset(address(stock), address(stockOracle), address(execution));
    }

    function test_malformedAssetConfigFailsClosed() public {
        MockNvdaC stock = new MockNvdaC();
        MockOracleAdapter matchingOracle = new MockOracleAdapter(address(stock));
        MockSwapRouter stockRouter = new MockSwapRouter(usdc, address(stock));
        ExecutionAdapter matchingExecution =
            new ExecutionAdapter(address(usdc), address(stock), address(stockRouter), BaseV1Constants.UNISWAP_FEE);

        MockOracleAdapter wrongOracle = new MockOracleAdapter(address(nvdac));
        vm.prank(assetAdmin);
        vm.expectRevert(MarginCall.InvalidAssetConfig.selector);
        marginCall.addAsset(address(stock), address(wrongOracle), address(matchingExecution));

        ExecutionAdapter wrongStockExecution =
            new ExecutionAdapter(address(usdc), address(nvdac), address(router), BaseV1Constants.UNISWAP_FEE);
        vm.prank(assetAdmin);
        vm.expectRevert(MarginCall.InvalidAssetConfig.selector);
        marginCall.addAsset(address(stock), address(matchingOracle), address(wrongStockExecution));

        MockUsdc otherUsdc = new MockUsdc();
        MockSwapRouter otherRouter = new MockSwapRouter(otherUsdc, address(stock));
        ExecutionAdapter wrongUsdcExecution =
            new ExecutionAdapter(address(otherUsdc), address(stock), address(otherRouter), BaseV1Constants.UNISWAP_FEE);
        vm.prank(assetAdmin);
        vm.expectRevert(MarginCall.InvalidAssetConfig.selector);
        marginCall.addAsset(address(stock), address(matchingOracle), address(wrongUsdcExecution));

        vm.prank(assetAdmin);
        vm.expectRevert(MarginCall.InvalidAssetConfig.selector);
        marginCall.addAsset(address(stock), address(matchingOracle), address(matchingOracle));

        vm.prank(assetAdmin);
        vm.expectRevert(MarginCall.ZeroAddress.selector);
        marginCall.addAsset(address(0), address(matchingOracle), address(matchingExecution));
    }

    function test_enumerationAndConfigReads() public {
        assertEq(marginCall.assetCount(), 1);
        assertEq(marginCall.assetAt(0), defaultAssetId);
        assertEq(marginCall.assetIdOf(address(nvdac)), defaultAssetId);

        MarginCall.AssetConfig memory config = marginCall.assetConfig(defaultAssetId);
        assertEq(config.stock, address(nvdac));
        assertEq(address(config.oracle), address(oracle));
        assertEq(address(config.execution), address(execution));
        assertTrue(config.openingEnabled);

        MockNvdaC stockB = new MockNvdaC();
        (MockOracleAdapter oracleB, ExecutionAdapter executionB) = _adaptersFor(stockB);
        vm.prank(assetAdmin);
        uint256 assetB = marginCall.addAsset(address(stockB), address(oracleB), address(executionB));

        assertEq(marginCall.assetCount(), 2);
        assertEq(marginCall.assetAt(0), defaultAssetId);
        assertEq(marginCall.assetAt(1), assetB);
        assertEq(marginCall.assetIdOf(address(stockB)), assetB);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.IndexOutOfBounds.selector, 2, 2));
        marginCall.assetAt(2);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.UnknownAsset.selector, 99));
        marginCall.assetConfig(99);
    }

    function test_disableOpeningBlocksNewOpensButExistingRemainManageable() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        uint256 stockBefore = _stockAmount(tokenId);
        uint256 debt = marginCall.currentDebt(tokenId);
        assertGt(debt, 0);

        vm.prank(assetAdmin);
        marginCall.setAssetOpeningEnabled(defaultAssetId, false);

        _fund(bob, ONE_NVDAC);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.AssetOpeningDisabled.selector, defaultAssetId));
        marginCall.openPosition(defaultAssetId, ONE_NVDAC, SPOT_LEVERAGE, 0, "");

        uint256 partialRepay = debt / 2;
        _fundUsdc(alice, partialRepay);
        vm.prank(alice);
        marginCall.repay(tokenId, partialRepay);
        assertEq(marginCall.currentDebt(tokenId), debt - partialRepay);

        uint256 sale = REDUCE_SALE;
        vm.prank(alice);
        marginCall.reduceExposure(tokenId, sale, 0);
        assertEq(_stockAmount(tokenId), stockBefore - sale);

        uint256 remaining = marginCall.currentDebt(tokenId);
        if (remaining > 0) {
            _fundUsdc(alice, remaining);
            vm.prank(alice);
            marginCall.repay(tokenId, remaining);
        }
        assertEq(marginCall.currentDebt(tokenId), 0);

        uint256 closeAmount = _stockAmount(tokenId);
        uint256 aliceBefore = nvdac.balanceOf(alice);
        vm.prank(alice);
        marginCall.closePosition(tokenId);
        assertEq(nvdac.balanceOf(alice), aliceBefore + closeAmount);
        _assertTokenDoesNotExist(tokenId);
    }

    function test_unknownAssetIdRevertsOnOpen() public {
        _fund(alice, ONE_NVDAC);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.UnknownAsset.selector, 0));
        marginCall.openPosition(0, ONE_NVDAC, SPOT_LEVERAGE, 0, "");

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.UnknownAsset.selector, 99));
        marginCall.openPosition(99, ONE_NVDAC, SPOT_LEVERAGE, 0, "");
    }

    function _adaptersFor(MockNvdaC stock)
        private
        returns (MockOracleAdapter stockOracle, ExecutionAdapter stockExecution)
    {
        stockOracle = new MockOracleAdapter(address(stock));
        MockSwapRouter stockRouter = new MockSwapRouter(usdc, address(stock));
        stockExecution =
            new ExecutionAdapter(address(usdc), address(stock), address(stockRouter), BaseV1Constants.UNISWAP_FEE);
    }
}
