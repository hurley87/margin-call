import { describe, expect, it } from "vitest";
import {
  clampCrashPointBps,
  getClosedTiersAtProgress,
  getReplayDurationMs,
  getReplayMultiplierBps,
  getReplayPath,
  getReplayProgress,
  getTierCloseProgress,
  isReplayComplete,
  isReplayHoldActive,
  REPLAY_DURATION_MAX_MS,
  REPLAY_DURATION_MIN_MS,
  REPLAY_HOLD_BEAT_SECONDS,
} from "./round-replay";

const ONE_X = 10_000n;
const TIERS = [12_500n, 15_000n, 20_000n, 30_000n, 50_000n, 100_000n] as const;

describe("round-replay math", () => {
  it("clamps sub-1.00x Crash Points to 1.00x", () => {
    expect(clampCrashPointBps(9_900n)).toBe(ONE_X);
    expect(clampCrashPointBps(0n)).toBe(ONE_X);
    expect(clampCrashPointBps(ONE_X)).toBe(ONE_X);
    expect(clampCrashPointBps(100_000n)).toBe(100_000n);
    expect(clampCrashPointBps(200_000n)).toBe(100_000n);
  });

  it("scales duration from 4s at 1.00x to 12s at 10.00x", () => {
    expect(getReplayDurationMs(ONE_X)).toBe(REPLAY_DURATION_MIN_MS);
    expect(getReplayDurationMs(9_900n)).toBe(REPLAY_DURATION_MIN_MS);
    expect(getReplayDurationMs(100_000n)).toBe(REPLAY_DURATION_MAX_MS);
    const mid = getReplayDurationMs(31_623n); // ~sqrt(10) ≈ 3.16x
    expect(mid).toBeGreaterThan(REPLAY_DURATION_MIN_MS);
    expect(mid).toBeLessThan(REPLAY_DURATION_MAX_MS);
  });

  it("returns exact 1.00x at p=0 and exact crash at p=1", () => {
    expect(getReplayMultiplierBps(0, 25_000n)).toBe(ONE_X);
    expect(getReplayMultiplierBps(1, 25_000n)).toBe(25_000n);
    expect(getReplayMultiplierBps(1, 100_000n)).toBe(100_000n);
  });

  it("is deterministic for identical inputs", () => {
    const a = getReplayMultiplierBps(0.5, 40_000n);
    const b = getReplayMultiplierBps(0.5, 40_000n);
    expect(a).toBe(b);
    expect(getReplayPath(40_000n, 0.5)).toBe(getReplayPath(40_000n, 0.5));
    expect(getReplayDurationMs(40_000n)).toBe(getReplayDurationMs(40_000n));
  });

  it("pins mid-arrival seekers past the duration to the final frame", () => {
    const crash = 50_000n;
    const duration = getReplayDurationMs(crash);
    expect(getReplayProgress(0, crash)).toBe(0);
    expect(getReplayProgress(duration / 2, crash)).toBeCloseTo(0.5, 5);
    expect(getReplayProgress(duration, crash)).toBe(1);
    expect(getReplayProgress(duration + 60_000, crash)).toBe(1);
    expect(isReplayComplete(1)).toBe(true);
    expect(getReplayMultiplierBps(1, crash)).toBe(crash);
  });

  it("closes no tiers for a clamped 1.00x Crash Point (guards log(1)=0)", () => {
    // Raw 0.99x floors to 1.00x; every Arcade Leverage tier is above 1.00x.
    expect(getTierCloseProgress(12_500n, 9_900n)).toBeNull();
    expect(getClosedTiersAtProgress(1, 9_900n, TIERS)).toEqual([]);
    expect(getReplayDurationMs(9_900n)).toBe(REPLAY_DURATION_MIN_MS);
  });

  it("closes the 10.00x tier at exactly p=1 when Crash Point is capped", () => {
    expect(getTierCloseProgress(100_000n, 100_000n)).toBe(1);
    const closed = getClosedTiersAtProgress(1, 100_000n, TIERS);
    expect(closed).toEqual([...TIERS]);
  });

  it("closes only tiers at or below the Crash Point (equality wins)", () => {
    const crash = 20_000n; // 2.00x
    expect(getTierCloseProgress(12_500n, crash)).not.toBeNull();
    expect(getTierCloseProgress(15_000n, crash)).not.toBeNull();
    expect(getTierCloseProgress(20_000n, crash)).toBe(1);
    expect(getTierCloseProgress(30_000n, crash)).toBeNull();

    const atHalf = getClosedTiersAtProgress(0.5, crash, TIERS);
    for (const tier of atHalf) {
      const closeAt = getTierCloseProgress(tier, crash);
      expect(closeAt).not.toBeNull();
      expect(closeAt!).toBeLessThanOrEqual(0.5);
    }

    const atEnd = getClosedTiersAtProgress(1, crash, TIERS);
    expect(atEnd).toEqual([12_500n, 15_000n, 20_000n]);
  });

  it("builds a non-empty SVG path that starts at the origin", () => {
    const path = getReplayPath(30_000n, 1);
    expect(path.startsWith("M ")).toBe(true);
    expect(path.includes(" L ")).toBe(true);
    expect(getReplayPath(30_000n, 0).startsWith("M ")).toBe(true);
  });

  it("holds the display round through the replay plus the result beat", () => {
    const finalizedAt = 5_000n;
    const crash = ONE_X; // 4s replay
    const holdSeconds = 4n + BigInt(REPLAY_HOLD_BEAT_SECONDS);

    expect(isReplayHoldActive(finalizedAt, crash, finalizedAt)).toBe(true);
    expect(
      isReplayHoldActive(finalizedAt, crash, finalizedAt + holdSeconds - 1n)
    ).toBe(true);
    expect(
      isReplayHoldActive(finalizedAt, crash, finalizedAt + holdSeconds)
    ).toBe(false);
  });

  it("holds longer for higher Crash Points (longer replays)", () => {
    const finalizedAt = 5_000n;
    const probe = finalizedAt + 10n; // past 4s+beat, inside 12s+beat
    expect(isReplayHoldActive(finalizedAt, ONE_X, probe)).toBe(false);
    expect(isReplayHoldActive(finalizedAt, 100_000n, probe)).toBe(true);
  });
});
