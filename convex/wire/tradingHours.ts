/**
 * epochSlot: absolute-hour bucket = floor(epochMs / 3_600_000). Monotonic,
 * globally unique per clock hour, dedupes cron retries within the same hour.
 */

export function isMarketOpen(nowMs: number): boolean {
  const dt = new Date(nowMs);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(dt)
      .map((p) => [p.type, p.value])
  );

  const weekday = parts.weekday;
  if (weekday === "Sat" || weekday === "Sun") return false;

  const hour = parseInt(parts.hour, 10);
  const minute = parseInt(parts.minute, 10);
  const totalMinutes = hour * 60 + minute;

  // 09:30 ET open (inclusive), 16:00 ET close (exclusive)
  return totalMinutes >= 9 * 60 + 30 && totalMinutes < 16 * 60;
}

export function currentEpochSlot(nowMs: number): number {
  return Math.floor(nowMs / (60 * 60 * 1000));
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
