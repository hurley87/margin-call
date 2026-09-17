// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {ExecutionAdapter} from "../../src/ExecutionAdapter.sol";
import {V1Config} from "../../src/V1Config.sol";
import {BaseV1Constants} from "../fixtures/BaseV1Constants.sol";
import {ExecutionFixtures} from "../fixtures/ExecutionFixtures.sol";
import {MockNvdaC, MockSwapRouter, MockUsdc} from "../margincall/PositionNftTestDoubles.sol";

contract ExecutionAdapterTest is Test {
    MockUsdc internal usdc;
    MockNvdaC internal nvdac;
    MockSwapRouter internal router;
    ExecutionAdapter internal execution;
    address internal trader;

    function setUp() public {
        trader = makeAddr("trader");
        usdc = new MockUsdc();
        nvdac = new MockNvdaC();
        router = new MockSwapRouter(usdc, nvdac);
        router.setLivePrice(BaseV1Constants.PINNED_FEED_ANSWER);
        execution = new ExecutionAdapter(address(usdc), address(nvdac), address(router), BaseV1Constants.UNISWAP_FEE);
    }

    function test_protocolMinsMatchFixtures() public view {
        uint256 buy = execution.protocolMinNvdaOutForBuy(100e6, BaseV1Constants.PINNED_FEED_ANSWER);
        uint256 sell = execution.protocolMinUsdcOutForSell(47_217_697, BaseV1Constants.PINNED_FEED_ANSWER);
        assertEq(buy, ExecutionFixtures.protocolMinNvdaOutForBuy(100e6, BaseV1Constants.PINNED_FEED_ANSWER));
        assertEq(sell, ExecutionFixtures.protocolMinUsdcOutForSell(47_217_697, BaseV1Constants.PINNED_FEED_ANSWER));
    }

    function test_buyUsesStricterOfCallerAndProtocolMin() public {
        uint256 amountIn = 100e6;
        usdc.mint(trader, amountIn);
        vm.startPrank(trader);
        usdc.approve(address(execution), amountIn);

        uint256 protocolMin = execution.protocolMinNvdaOutForBuy(amountIn, BaseV1Constants.PINNED_FEED_ANSWER);
        uint256 amountOut = execution.buyNvda(amountIn, protocolMin, BaseV1Constants.PINNED_FEED_ANSWER);
        vm.stopPrank();

        assertGe(amountOut, protocolMin);
        assertEq(nvdac.balanceOf(trader), amountOut);
        assertEq(usdc.balanceOf(trader), 0);
    }

    function test_buyRevertsWhenCallerMinExceedsFill() public {
        uint256 amountIn = 100e6;
        usdc.mint(trader, amountIn);
        vm.startPrank(trader);
        usdc.approve(address(execution), amountIn);

        uint256 fairOut = Math.mulDiv(
            amountIn, V1Config.VALUATION_DENOMINATOR, BaseV1Constants.PINNED_FEED_ANSWER, Math.Rounding.Floor
        );
        vm.expectRevert(bytes("Too little received"));
        execution.buyNvda(amountIn, fairOut + 1, BaseV1Constants.PINNED_FEED_ANSWER);
        vm.stopPrank();

        assertEq(usdc.balanceOf(trader), amountIn);
        assertEq(nvdac.balanceOf(trader), 0);
    }

    function test_sellUsesProtocolFloor() public {
        uint256 amountIn = 47_217_697;
        nvdac.mint(trader, amountIn);
        vm.startPrank(trader);
        nvdac.approve(address(execution), amountIn);
        uint256 protocolMin = execution.protocolMinUsdcOutForSell(amountIn, BaseV1Constants.PINNED_FEED_ANSWER);
        uint256 amountOut = execution.sellNvda(amountIn, 0, BaseV1Constants.PINNED_FEED_ANSWER);
        vm.stopPrank();

        assertGe(amountOut, protocolMin);
        assertEq(usdc.balanceOf(trader), amountOut);
        assertEq(nvdac.balanceOf(trader), 0);
    }

    function test_zeroAmountReverts() public {
        vm.expectRevert(ExecutionAdapter.ZeroAmount.selector);
        execution.buyNvda(0, 0, BaseV1Constants.PINNED_FEED_ANSWER);
        vm.expectRevert(ExecutionAdapter.ZeroAmount.selector);
        execution.sellNvda(0, 0, BaseV1Constants.PINNED_FEED_ANSWER);
    }
}
