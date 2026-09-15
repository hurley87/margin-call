// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

/// @title NvdaFeedCadence
/// @notice Test-only scanner for consecutive NVDA feed gaps. Not production oracle code.
library NvdaFeedCadence {
    struct Stats {
        uint256 roundCount;
        uint256 gapCount;
        uint256 firstUpdatedAt;
        uint256 lastUpdatedAt;
        uint256 minGap;
        uint256 maxGap;
        uint256 medianGap;
        uint256 maxGapAtMostMaxLiveAge;
        uint256 minGapAboveMaxLiveAge;
        uint256 gapsAboveMaxLiveAge;
        uint256 gapsAbove1Day;
        uint256 gapsAbove2Days;
        uint256 medianAbsBps;
        uint256 movesBetween40And70Bps;
    }

    /// @notice Summarize consecutive `updatedAt` gaps and absolute basis-point moves.
    /// @dev `medianGap` / `medianAbsBps` are the middle sorted values. Gap count is odd for 362 rounds.
    function summarize(uint256[] memory updatedAt, int256[] memory answers, uint256 maxLiveAge)
        internal
        pure
        returns (Stats memory stats)
    {
        uint256 n = updatedAt.length;
        require(n == answers.length, "cadence length");
        stats.roundCount = n;
        if (n == 0) {
            return stats;
        }
        stats.firstUpdatedAt = updatedAt[0];
        stats.lastUpdatedAt = updatedAt[n - 1];
        if (n == 1) {
            return stats;
        }

        uint256 gapCount = n - 1;
        stats.gapCount = gapCount;
        uint256[] memory gaps = new uint256[](gapCount);
        uint256[] memory bps = new uint256[](gapCount);
        stats.minGap = type(uint256).max;
        stats.minGapAboveMaxLiveAge = type(uint256).max;

        for (uint256 i = 0; i < gapCount; i++) {
            require(updatedAt[i + 1] >= updatedAt[i], "cadence order");
            uint256 gap = updatedAt[i + 1] - updatedAt[i];
            gaps[i] = gap;
            if (gap < stats.minGap) {
                stats.minGap = gap;
            }
            if (gap > stats.maxGap) {
                stats.maxGap = gap;
            }
            if (gap <= maxLiveAge) {
                if (gap > stats.maxGapAtMostMaxLiveAge) {
                    stats.maxGapAtMostMaxLiveAge = gap;
                }
            } else {
                stats.gapsAboveMaxLiveAge++;
                if (gap < stats.minGapAboveMaxLiveAge) {
                    stats.minGapAboveMaxLiveAge = gap;
                }
                if (gap > 1 days) {
                    stats.gapsAbove1Day++;
                }
                if (gap > 2 days) {
                    stats.gapsAbove2Days++;
                }
            }

            bps[i] = _absBps(answers[i], answers[i + 1]);
            if (bps[i] >= 40 && bps[i] <= 70) {
                stats.movesBetween40And70Bps++;
            }
        }

        stats.medianGap = _median(gaps);
        stats.medianAbsBps = _median(bps);
        if (stats.gapsAboveMaxLiveAge == 0) {
            stats.minGapAboveMaxLiveAge = 0;
        }
    }

    function _absBps(int256 previous, int256 next) private pure returns (uint256) {
        require(previous > 0, "cadence answer");
        uint256 prev = uint256(previous);
        uint256 nxt = next >= 0 ? uint256(next) : uint256(-next);
        uint256 diff = prev > nxt ? prev - nxt : nxt - prev;
        return diff * 10_000 / prev;
    }

    function _median(uint256[] memory values) private pure returns (uint256) {
        _sort(values);
        return values[values.length / 2];
    }

    function _sort(uint256[] memory values) private pure {
        uint256 n = values.length;
        for (uint256 i = 1; i < n; i++) {
            uint256 key = values[i];
            uint256 j = i;
            while (j > 0 && values[j - 1] > key) {
                values[j] = values[j - 1];
                j--;
            }
            values[j] = key;
        }
    }
}
