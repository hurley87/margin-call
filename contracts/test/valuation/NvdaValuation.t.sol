// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {NvdaValuation} from "./NvdaValuation.sol";

/// @dev RPC-free tests for the test-only valuation reference. Not production valuation code.
contract NvdaValuationTest is Test {
    uint256 internal constant ONE_WAD = 1e18;

    function test_verifiedDecimalNormalization() public pure {
        assertEq(NvdaValuation.STOCK_DECIMALS, 8);
        assertEq(NvdaValuation.FEED_DECIMALS, 8);
        assertEq(NvdaValuation.USDC_DECIMALS, 6);
        assertEq(NvdaValuation.NORMALIZATION_DENOMINATOR, 1e10);
    }

    function test_oneNvdaAtKnownPrice() public pure {
        assertEq(NvdaValuation.toUsdcRawFloor(1e8, 220e8), 220e6);
    }

    function test_issueWorkedExample() public pure {
        // 1.25 raw NVDAc at the already multiplier-adjusted $220 feed mark = $275.
        assertEq(NvdaValuation.toUsdcRawFloor(125_000_000, 22_000_000_000), 275_000_000);
    }

    function test_fractionalNvdaRoundsDownToUsdcBaseUnit() public pure {
        // 0.12345678 NVDAc at the pinned $211.785 feed mark.
        // The exact quotient is 26_146_294.1523 USDC base units, so lender-risk NAV is floored.
        assertEq(NvdaValuation.toUsdcRawFloor(12_345_678, 21_178_500_000), 26_146_294);
    }

    function test_verySmallRawAmounts() public pure {
        assertEq(NvdaValuation.toUsdcRawFloor(1, 22_000_000_000), 2);
        assertEq(NvdaValuation.toUsdcRawFloor(1, 9_999_999_999), 0);
    }

    function test_realisticDemoSizedAmountAtPinnedFeedAnswer() public pure {
        // 5.75 NVDAc at the pinned $211.785 feed mark = $1,217.76375.
        assertEq(NvdaValuation.toUsdcRawFloor(575_000_000, 21_178_500_000), 1_217_763_750);
    }

    function test_zeroTokenAmountHasZeroValue() public pure {
        assertEq(NvdaValuation.toUsdcRawFloor(0, 22_000_000_000), 0);
    }

    function test_fullPrecisionIntermediateMultiplication() public pure {
        // 1e40 * 1e40 exceeds uint256, while the normalized 1e70 result fits.
        assertGt(1e40, type(uint256).max / 1e40);
        assertEq(NvdaValuation.toUsdcRawFloor(1e40, 1e40), 1e70);
    }

    function test_secondMultiplierApplicationDoubleCountsTotalReturn() public pure {
        uint256 totalReturnFeedAnswer = 220e8;
        uint256 correctValue = NvdaValuation.toUsdcRawFloor(1e8, totalReturnFeedAnswer);
        uint256 futureMultiplier = 1.02e18;
        uint256 incorrectDoubleAppliedValue = Math.mulDiv(correctValue, futureMultiplier, ONE_WAD);

        assertEq(correctValue, 220e6);
        assertEq(incorrectDoubleAppliedValue, 224_400_000);
        assertGt(incorrectDoubleAppliedValue, correctValue);
    }

    function test_oneWadMultiplierCanMaskButDoesNotRemoveDoubleApplicationBug() public pure {
        uint256 correctValue = NvdaValuation.toUsdcRawFloor(1e8, 220e8);

        // Equality at today's 1e18 multiplier does not justify a separate multiplier step.
        assertEq(Math.mulDiv(correctValue, ONE_WAD, ONE_WAD), correctValue);
        // The reference API has no multiplier argument: raw amount and total-return answer are sufficient.
        assertEq(correctValue, 220e6);
    }
}
