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

/** Returns lowercase weekday name matching season.weeklyShape keys. */
export function dayPosture(nowMs: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  })
    .format(new Date(nowMs))
    .toLowerCase();
}
