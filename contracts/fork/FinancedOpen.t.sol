// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {IOracleAdapter} from "../src/interfaces/IOracleAdapter.sol";
import {MarginCall} from "../src/MarginCall.sol";
import {V1Config} from "../src/V1Config.sol";
import {BaseV1Constants} from "../test/fixtures/BaseV1Constants.sol";
import {MarginCallForkBase} from "./MarginCallForkBase.sol";

/// @dev Pinned Base-mainnet proof that production adapters open every financed preset via Uniswap V3.
contract FinancedOpenForkTest is MarginCallForkBase {

    function _forkActorLabel() internal pure override returns (string memory) {
        return "financed-fork-alice-422";
    }

    function test_oracleIsLiveAtPinnedBlock() public {
        IOracleAdapter.Observation memory obs = oracle.latestObservation();
        assertEq(uint256(obs.state), uint256(IOracleAdapter.State.LIVE));
        assertEq(obs.price, BaseV1Constants.PINNED_FEED_ANSWER);
    }

    function test_financedOpenAllPresetsOnUniswap() public {
        uint256[4] memory presets = [
            V1Config.LEVERAGE_1_1X,
            V1Config.LEVERAGE_1_25X,
            V1Config.LEVERAGE_1_4X,
            V1Config.LEVERAGE_1_5X
        ];

        for (uint256 i = 0; i < presets.length; ++i) {
            uint256 poolBefore = pool.availableCredit();
            uint256 custodyBefore = nvdac.balanceOf(address(marginCall));

            vm.prank(alice);
            uint256 tokenId = marginCall.openPosition(ONE_NVDAC, presets[i], 0);

            (uint256 stock, uint256 principal,,,) = marginCall.positions(tokenId);
            assertEq(marginCall.ownerOf(tokenId), alice);
            assertGt(stock, ONE_NVDAC);
            assertGt(principal, 0);
            assertEq(marginCall.currentDebt(tokenId), principal);
            assertEq(pool.availableCredit(), poolBefore - principal);
            assertEq(nvdac.balanceOf(address(marginCall)), custodyBefore + stock);
            assertEq(usdc.balanceOf(address(marginCall)), 0);

            IOracleAdapter.Observation memory obs = oracle.latestObservation();
            uint256 nav = oracle.valueUsdc(stock, obs.price);
            assertLe(nav * V1Config.BPS_DENOMINATOR, (nav - principal) * presets[i]);
            assertLe(nav * V1Config.BPS_DENOMINATOR, (nav - principal) * V1Config.LEVERAGE_1_5X);
        }
    }

    function test_intermediateLeverageRevertsOnFork() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.UnsupportedLeverage.selector, 13_000));
        marginCall.openPosition(ONE_NVDAC, 13_000, 0);
    }

    function test_insufficientCreditRevertsOnFork() public {
        uint256 available = pool.availableCredit();
        vm.prank(address(marginCall));
        pool.draw(available - 1e6);

        uint256 aliceBefore = nvdac.balanceOf(alice);
        uint256 poolBefore = pool.availableCredit();

        vm.prank(alice);
        vm.expectRevert();
        marginCall.openPosition(ONE_NVDAC, V1Config.LEVERAGE_1_5X, 0);

        assertEq(nvdac.balanceOf(alice), aliceBefore);
        assertEq(pool.availableCredit(), poolBefore);
        assertEq(nvdac.balanceOf(address(marginCall)), 0);
    }

    function test_spotStillOpensWithEmptyPoolOnFork() public {
        uint256 available = pool.availableCredit();
        vm.prank(address(marginCall));
        pool.draw(available);

        vm.prank(alice);
        uint256 tokenId = marginCall.openPosition(ONE_NVDAC, V1Config.SPOT_LEVERAGE, 0);
        (uint256 stock, uint256 principal,,,) = marginCall.positions(tokenId);
        assertEq(stock, ONE_NVDAC);
        assertEq(principal, 0);
    }

    function test_nonLiveOracleRevertsFinancedOpenOnFork() public {
        // Freeze the feed as stale beyond MAX_LIVE_AGE while leaving the registry unpaused.
        vm.warp(block.timestamp + BaseV1Constants.MAX_LIVE_AGE + 1);

        uint256 aliceBefore = nvdac.balanceOf(alice);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.OracleNotLive.selector, IOracleAdapter.State.INVALID));
        marginCall.openPosition(ONE_NVDAC, V1Config.LEVERAGE_1_1X, 0);
        assertEq(nvdac.balanceOf(alice), aliceBefore);
    }

    function test_tightCallerMinOutRevertsAtomicallyOnFork() public {
        uint256 aliceBefore = nvdac.balanceOf(alice);
        uint256 poolBefore = pool.availableCredit();

        // Unrealistically high minOut forces SwapRouter02 "Too little received".
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "Too little received"));
        marginCall.openPosition(ONE_NVDAC, V1Config.LEVERAGE_1_25X, type(uint256).max / 2);

        assertEq(nvdac.balanceOf(alice), aliceBefore);
        assertEq(pool.availableCredit(), poolBefore);
        assertEq(usdc.balanceOf(address(marginCall)), 0);
        assertEq(nvdac.balanceOf(address(marginCall)), 0);
    }

    function test_executionAdapterBuyRespectsProtocolFloorOnFork() public {
        IOracleAdapter.Observation memory obs = oracle.latestObservation();
        uint256 amountIn = 100e6;
        deal(BaseV1Constants.USDC, address(this), amountIn);
        usdc.approve(address(execution), amountIn);

        uint256 minOut = execution.protocolMinNvdaOutForBuy(amountIn, obs.price);
        uint256 before = nvdac.balanceOf(address(this));
        uint256 amountOut = execution.buyNvda(amountIn, minOut, obs.price);
        assertGe(amountOut, minOut);
        assertEq(nvdac.balanceOf(address(this)) - before, amountOut);
    }

}
