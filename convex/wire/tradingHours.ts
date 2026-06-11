/**
 * Wire-specific trading-hours helpers.
 *
 * `isMarketOpen` delegates to the canonical `convex/lib/tradingHours.ts`
 * utility (single source of truth for trading-hours math). Wire-only helpers
 * (`currentEpochSlot`, `isOpeningBell`, `dayPosture`) live here.
 *
 * epochSlot: absolute-hour bucket = floor(epochMs / 3_600_000). Monotonic,
 * globally unique per clock hour, dedupes cron retries within the same hour.
 */

import { isTradingHours } from "../lib/tradingHours";

const HOUR_MS = 60 * 60 * 1000;

export function isMarketOpen(nowMs: number): boolean {
  return isTradingHours(nowMs);
}

export function currentEpochSlot(nowMs: number): number {
  return Math.floor(nowMs / HOUR_MS);
}

/**
 * Returns true when the current drop is the last one before the close — i.e.
 * the market is open now but will be closed one hour from now. This is the
 * slot that carries the satirical daily wrap.
 */
export function isClosingBell(nowMs: number): boolean {
  return isMarketOpen(nowMs) && !isMarketOpen(nowMs + HOUR_MS);
}

/**
 * Returns true when the current drop is the first of the trading day.
 * Consecutive market-hour drops are exactly 1 epochSlot apart; overnight gaps
 * are 17–18 slots. Any gap > 1 means we missed at least one hourly tick (i.e.
 * the market was closed overnight) — this is the opening bell.
 */
export function isOpeningBell(
  currentSlot: number,
  lastDropSlot: number | null | undefined
): boolean {
  if (lastDropSlot == null) return false;
  return currentSlot - lastDropSlot > 1;
}

/** Returns lowercase weekday name matching season.weeklyShape keys. */
export function dayPosture(nowMs: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  })
    .format(new Date(nowMs))
    .toLowerCase();
}
