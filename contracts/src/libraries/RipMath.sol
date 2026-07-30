// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RipMath
/// @notice Pure selection / pricing helpers for RipEngine.
/// @dev Weights are `SCALE * WAD / N^alpha` with whole-number alpha only (multiples of WAD).
///      Harmonic mean uses the correct `n / Σ(1/N_i)` form. Draw is without replacement.
library RipMath {
    /// @notice WAD scale for ratios and USD NAV ($1 = 1e18).
    uint256 internal constant WAD = 1e18;

    /// @notice Fixed large constant so inverse-NAV weights stay above 1 for NAV ≤ poolMax.
    /// @dev PRD suggests ~1e36; with WAD-NAV the product `SCALE * WAD` is 1e54 before / N^α.
    uint256 internal constant SCALE = 1e36;

    /// @notice Max whole-number exponent for `N^alpha` (guards gas / overflow).
    uint256 internal constant MAX_ALPHA_EXPONENT = 8;

    error EmptySet();
    error ZeroNav();
    error FractionalAlphaUnsupported(uint256 alpha);
    error AlphaExponentTooHigh(uint256 exponent);
    error CountOutOfRange(uint256 count, uint256 setSize);
    error ZeroTotalWeight();

    /// @notice Selection weight `SCALE * WAD / N^alpha` (WAD-scaled).
    /// @dev `alpha` must be a whole multiple of WAD (0, 1e18, 2e18, …). Alpha 0 → uniform.
    function weightOf(uint256 nav, uint256 alpha) internal pure returns (uint256) {
        if (nav == 0) revert ZeroNav();
        if (alpha % WAD != 0) revert FractionalAlphaUnsupported(alpha);

        uint256 exponent = alpha / WAD;
        if (exponent > MAX_ALPHA_EXPONENT) revert AlphaExponentTooHigh(exponent);

        if (exponent == 0) {
            return SCALE; // uniform — independent of NAV
        }

        uint256 powered = nav;
        for (uint256 i = 1; i < exponent; ++i) {
            powered = (powered * nav) / WAD;
        }

        return (SCALE * WAD) / powered;
    }

    /// @notice Harmonic mean of WAD-NAV values: `n / Σ(1/N_i)`.
    function harmonicMean(uint256[] memory navs) internal pure returns (uint256) {
        uint256 n = navs.length;
        if (n == 0) revert EmptySet();

        uint256 invSum;
        for (uint256 i; i < n; ++i) {
            uint256 nav = navs[i];
            if (nav == 0) revert ZeroNav();
            invSum += (WAD * WAD) / nav; // 1/N in WAD² so hm stays in WAD
        }

        // hm = n / Σ(1/N) = n * WAD² / invSum, but invSum already has WAD²/N so:
        // hm_WAD = n * WAD / Σ(WAD/N) where Σ(WAD/N) = invSum / WAD
        // => hm = n * WAD * WAD / invSum
        return (n * WAD * WAD) / invSum;
    }

    /// @notice `clamp(hm * (1 + surcharge), [minPackNav, poolMax] * (1 + surcharge))`.
    function clampUnitPrice(uint256 harmonicMean_, uint256 surcharge, uint256 minPackNav, uint256 poolMax)
        internal
        pure
        returns (uint256)
    {
        uint256 factor = WAD + surcharge;
        uint256 raw = (harmonicMean_ * factor) / WAD;
        uint256 lo = (minPackNav * factor) / WAD;
        uint256 hi = (poolMax * factor) / WAD;

        if (raw < lo) return lo;
        if (raw > hi) return hi;
        return raw;
    }

    /// @notice Draw `count` distinct indices with probability ∝ `weights`, without replacement.
    /// @dev Mutates a working copy of weights via swap-and-pop. Seed expanded per draw.
    /// @return indices Drawn positions into the original `weights` array (pre-mutation order).
    function drawDistinct(uint256[] memory weights, uint256 seed, uint256 count)
        internal
        pure
        returns (uint256[] memory indices)
    {
        uint256 n = weights.length;
        if (count == 0 || count > n) revert CountOutOfRange(count, n);

        // Working arrays: weight + original index (so we return pre-mutation positions).
        uint256[] memory w = new uint256[](n);
        uint256[] memory orig = new uint256[](n);
        uint256 total;
        for (uint256 i; i < n; ++i) {
            w[i] = weights[i];
            orig[i] = i;
            total += weights[i];
        }
        if (total == 0) revert ZeroTotalWeight();

        indices = new uint256[](count);
        uint256 remaining = n;

        for (uint256 k; k < count; ++k) {
            uint256 drawSeed = uint256(keccak256(abi.encodePacked(seed, k)));
            uint256 pick = drawSeed % total;
            uint256 cumulative;
            uint256 chosen = remaining - 1; // fallback

            for (uint256 i; i < remaining; ++i) {
                cumulative += w[i];
                if (pick < cumulative) {
                    chosen = i;
                    break;
                }
            }

            indices[k] = orig[chosen];
            total -= w[chosen];

            // Swap-and-pop chosen out of the working set.
            uint256 last = remaining - 1;
            if (chosen != last) {
                w[chosen] = w[last];
                orig[chosen] = orig[last];
            }
            remaining = last;
        }
    }
}
