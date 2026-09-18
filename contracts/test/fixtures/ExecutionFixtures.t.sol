// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";

import {BaseV1Constants} from "./BaseV1Constants.sol";
import {ExecutionFixtures} from "./ExecutionFixtures.sol";

contract ExecutionFixturesTest is Test {
    function test_approvedPairAndFeeAreExact() public pure {
        assertTrue(ExecutionFixtures.isApprovedPair(BaseV1Constants.USDC, BaseV1Constants.NVDAC));
        assertTrue(ExecutionFixtures.isApprovedPair(BaseV1Constants.NVDAC, BaseV1Constants.USDC));
        assertFalse(ExecutionFixtures.isApprovedPair(BaseV1Constants.USDC, address(1)));
        assertFalse(ExecutionFixtures.isApprovedPair(BaseV1Constants.NVDAC, BaseV1Constants.NVDAC));

        assertTrue(ExecutionFixtures.isApprovedFee(BaseV1Constants.UNISWAP_FEE));
        assertFalse(ExecutionFixtures.isApprovedFee(500));
    }

    function test_effectiveMinOutUsesStricterCallerBound() public pure {
        assertEq(ExecutionFixtures.effectiveMinOut(47_000_000, 46_745_521), 47_000_000);
    }

    function test_effectiveMinOutUsesStricterProtocolBound() public pure {
        assertEq(ExecutionFixtures.effectiveMinOut(46_000_000, 46_745_521), 46_745_521);
    }

    function test_representativeBuyProtocolMinOutRoundsUp() public pure {
        uint256 minOut = ExecutionFixtures.protocolMinStockOutForBuy(
            ExecutionFixtures.REPRESENTATIVE_USDC_BUY_INPUT, BaseV1Constants.PINNED_FEED_ANSWER
        );

        assertEq(minOut, 46_745_521);
        // One fewer raw unit would lie below the exact 99% oracle-value floor.
        assertLt(
            (minOut - 1) * BaseV1Constants.PINNED_FEED_ANSWER * BaseV1Constants.BPS_DENOMINATOR,
            ExecutionFixtures.REPRESENTATIVE_USDC_BUY_INPUT * ExecutionFixtures.NORMALIZATION_DENOMINATOR
                * ExecutionFixtures.ADVERSE_BOUND_BPS
        );
    }

    function test_representativeSellProtocolMinOutRoundsUp() public pure {
        uint256 minOut = ExecutionFixtures.protocolMinUsdcOutForSell(
            ExecutionFixtures.REPRESENTATIVE_NVDAC_SELL_INPUT, BaseV1Constants.PINNED_FEED_ANSWER
        );

        assertEq(minOut, 99_000_000);
        // One fewer USDC base unit would lie below the exact 99% oracle-value floor.
        assertLt(
            (minOut - 1) * ExecutionFixtures.NORMALIZATION_DENOMINATOR * BaseV1Constants.BPS_DENOMINATOR,
            ExecutionFixtures.REPRESENTATIVE_NVDAC_SELL_INPUT * BaseV1Constants.PINNED_FEED_ANSWER
                * ExecutionFixtures.ADVERSE_BOUND_BPS
        );
    }

    function test_zeroAmountsHaveZeroMinimumOutput() public pure {
        assertEq(ExecutionFixtures.protocolMinStockOutForBuy(0, BaseV1Constants.PINNED_FEED_ANSWER), 0);
        assertEq(ExecutionFixtures.protocolMinUsdcOutForSell(0, BaseV1Constants.PINNED_FEED_ANSWER), 0);
    }

    function test_zeroPriceReverts() public {
        vm.expectRevert(ExecutionFixtures.InvalidLivePrice.selector);
        this.protocolMinStockOutForBuy(1, 0);

        vm.expectRevert(ExecutionFixtures.InvalidLivePrice.selector);
        this.protocolMinUsdcOutForSell(1, 0);
    }

    function protocolMinStockOutForBuy(uint256 amountIn, uint256 livePrice) external pure returns (uint256) {
        return ExecutionFixtures.protocolMinStockOutForBuy(amountIn, livePrice);
    }

    function protocolMinUsdcOutForSell(uint256 amountIn, uint256 livePrice) external pure returns (uint256) {
        return ExecutionFixtures.protocolMinUsdcOutForSell(amountIn, livePrice);
    }
}
