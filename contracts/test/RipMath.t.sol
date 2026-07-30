// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {RipMath} from "../src/libraries/RipMath.sol";

/// @notice Pure math coverage: weights, harmonic mean, clamp, seeded draw distribution.
contract RipMathTest is Test {
    uint256 internal constant WAD = 1e18;

    // PRD worked example (illustrative live prices).
    uint256 internal constant GME = 22_16 * 1e16; // $22.16
    uint256 internal constant NVDA = 196_74 * 1e16; // $196.74
    uint256 internal constant TSLA = 307_35 * 1e16; // $307.35

    // ========== weightOf ==========

    function test_weightOf_alphaZero_isUniform() public pure {
        uint256 wCheap = RipMath.weightOf(20 * WAD, 0);
        uint256 wRich = RipMath.weightOf(300 * WAD, 0);
        assertEq(wCheap, wRich);
        assertEq(wCheap, RipMath.SCALE);
    }

    function test_weightOf_alphaOne_isInverseNav() public pure {
        uint256 wGme = RipMath.weightOf(GME, WAD);
        uint256 wNvda = RipMath.weightOf(NVDA, WAD);
        uint256 wTsla = RipMath.weightOf(TSLA, WAD);

        // Relative shares ≈ 84% / 10% / 6%.
        uint256 total = wGme + wNvda + wTsla;
        assertApproxEqRel((wGme * WAD) / total, 84e16, 0.02e18); // ±2%
        assertApproxEqRel((wNvda * WAD) / total, 10e16, 0.05e18);
        assertApproxEqRel((wTsla * WAD) / total, 6e16, 0.05e18);
    }

    function test_weightOf_alphaTwo_favorsCheapHarder() public pure {
        uint256 wCheap1 = RipMath.weightOf(20 * WAD, WAD);
        uint256 wRich1 = RipMath.weightOf(200 * WAD, WAD);
        uint256 ratio1 = (wCheap1 * WAD) / wRich1; // ~10×

        uint256 wCheap2 = RipMath.weightOf(20 * WAD, 2 * WAD);
        uint256 wRich2 = RipMath.weightOf(200 * WAD, 2 * WAD);
        uint256 ratio2 = (wCheap2 * WAD) / wRich2; // ~100×

        assertGt(ratio2, ratio1);
        assertApproxEqRel(ratio2, 100 * WAD, 0.01e18);
    }

    function test_weightOf_zeroNavReverts() public {
        vm.expectRevert(RipMath.ZeroNav.selector);
        this.weightOfExternal(0, WAD);
    }

    function test_weightOf_fractionalAlphaReverts() public {
        vm.expectRevert(abi.encodeWithSelector(RipMath.FractionalAlphaUnsupported.selector, WAD / 2));
        this.weightOfExternal(20 * WAD, WAD / 2);
    }

    function test_weightOf_exponentTooHighReverts() public {
        uint256 alpha = 9 * WAD;
        vm.expectRevert(abi.encodeWithSelector(RipMath.AlphaExponentTooHigh.selector, uint256(9)));
        this.weightOfExternal(20 * WAD, alpha);
    }

    function weightOfExternal(uint256 nav, uint256 alpha) external pure returns (uint256) {
        return RipMath.weightOf(nav, alpha);
    }

    // ========== harmonicMean ==========

    function test_harmonicMean_prdWorkedExample() public pure {
        uint256[] memory navs = new uint256[](3);
        navs[0] = GME;
        navs[1] = NVDA;
        navs[2] = TSLA;

        uint256 hm = RipMath.harmonicMean(navs);
        // PRD: ≈ $56
        assertApproxEqRel(hm, 56 * WAD, 0.02e18);
    }

    function test_harmonicMean_equalNavs() public pure {
        uint256[] memory navs = new uint256[](3);
        navs[0] = 100 * WAD;
        navs[1] = 100 * WAD;
        navs[2] = 100 * WAD;
        assertEq(RipMath.harmonicMean(navs), 100 * WAD);
    }

    function test_harmonicMean_emptyReverts() public {
        uint256[] memory navs = new uint256[](0);
        vm.expectRevert(RipMath.EmptySet.selector);
        this.harmonicMeanExternal(navs);
    }

    function test_harmonicMean_zeroNavReverts() public {
        uint256[] memory navs = new uint256[](2);
        navs[0] = 100 * WAD;
        navs[1] = 0;
        vm.expectRevert(RipMath.ZeroNav.selector);
        this.harmonicMeanExternal(navs);
    }

    function harmonicMeanExternal(uint256[] memory navs) external pure returns (uint256) {
        return RipMath.harmonicMean(navs);
    }

    // ========== clampUnitPrice ==========

    function test_clampUnitPrice_interior() public pure {
        // hm=$56, surcharge=10% → $61.6; band [$20,$300]×1.1 = [$22,$330]
        uint256 price = RipMath.clampUnitPrice(56 * WAD, WAD / 10, 20 * WAD, 300 * WAD);
        assertEq(price, (56 * WAD * 11) / 10);
    }

    function test_clampUnitPrice_floor() public pure {
        // hm below min → clamps to min*(1+s)
        uint256 price = RipMath.clampUnitPrice(10 * WAD, WAD / 10, 20 * WAD, 300 * WAD);
        assertEq(price, (20 * WAD * 11) / 10);
    }

    function test_clampUnitPrice_ceiling() public pure {
        uint256 price = RipMath.clampUnitPrice(400 * WAD, WAD / 10, 20 * WAD, 300 * WAD);
        assertEq(price, (300 * WAD * 11) / 10);
    }

    // ========== drawDistinct ==========

    function test_drawDistinct_noReplacement() public pure {
        uint256[] memory weights = new uint256[](5);
        for (uint256 i; i < 5; ++i) {
            weights[i] = 100;
        }

        uint256[] memory drawn = RipMath.drawDistinct(weights, 42, 3);
        assertEq(drawn.length, 3);

        // All distinct.
        for (uint256 i; i < drawn.length; ++i) {
            assertLt(drawn[i], 5);
            for (uint256 j; j < i; ++j) {
                assertTrue(drawn[i] != drawn[j]);
            }
        }
    }

    function test_drawDistinct_countOutOfRange() public {
        uint256[] memory weights = new uint256[](2);
        weights[0] = 1;
        weights[1] = 1;

        vm.expectRevert(abi.encodeWithSelector(RipMath.CountOutOfRange.selector, uint256(0), uint256(2)));
        this.drawDistinctExternal(weights, 1, 0);

        vm.expectRevert(abi.encodeWithSelector(RipMath.CountOutOfRange.selector, uint256(3), uint256(2)));
        this.drawDistinctExternal(weights, 1, 3);
    }

    function test_drawDistinct_zeroTotalWeightReverts() public {
        uint256[] memory weights = new uint256[](2);
        vm.expectRevert(RipMath.ZeroTotalWeight.selector);
        this.drawDistinctExternal(weights, 1, 1);
    }

    function drawDistinctExternal(uint256[] memory weights, uint256 seed, uint256 count)
        external
        pure
        returns (uint256[] memory)
    {
        return RipMath.drawDistinct(weights, seed, count);
    }

    // ========== Statistical odds over seeded draws ==========

    function test_drawDistinct_prdOddsDistribution() public pure {
        uint256[] memory weights = new uint256[](3);
        weights[0] = RipMath.weightOf(GME, WAD);
        weights[1] = RipMath.weightOf(NVDA, WAD);
        weights[2] = RipMath.weightOf(TSLA, WAD);

        uint256[3] memory counts;
        uint256 samples = 10_000;

        for (uint256 s; s < samples; ++s) {
            uint256[] memory drawn = RipMath.drawDistinct(weights, s + 1, 1);
            counts[drawn[0]]++;
        }

        // Expected ≈ 84% / 10% / 6%. Allow ±2pp absolute for 10k samples.
        assertApproxEqAbs((counts[0] * 100) / samples, 84, 2);
        assertApproxEqAbs((counts[1] * 100) / samples, 10, 2);
        assertApproxEqAbs((counts[2] * 100) / samples, 6, 2);
    }

    function test_drawDistinct_uniformWhenEqualWeights() public pure {
        uint256[] memory weights = new uint256[](4);
        for (uint256 i; i < 4; ++i) {
            weights[i] = 1e18;
        }

        uint256[4] memory counts;
        uint256 samples = 8_000;

        for (uint256 s; s < samples; ++s) {
            uint256[] memory drawn = RipMath.drawDistinct(weights, s + 7, 1);
            counts[drawn[0]]++;
        }

        for (uint256 i; i < 4; ++i) {
            assertApproxEqAbs((counts[i] * 100) / samples, 25, 2);
        }
    }
}
