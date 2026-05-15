/**
 * Canonical trading-hours utility.
 *
 * Trading hours: Monday–Friday, 09:30:00–16:00:00 America/New_York
 *   - 09:30 open (inclusive)
 *   - 16:00 close (exclusive)
 *
 * All time math uses `Intl.DateTimeFormat` with `timeZone: "America/New_York"`,
 * so DST transitions are handled correctly by the platform formatter (no
 * `Date.getHours()`, no hardcoded UTC offsets).
 *
 * Holidays / half-days are explicitly out of scope for v1; the API is shaped so
 * holiday data can be folded in later without changing call sites.
 *
 * `now?: number` is required on every exported function so tests can inject
 * time without `vi.useFakeTimers()`.
 */

export const TRADING_TIMEZONE = "America/New_York" as const;
export const TRADING_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
export const MARKET_OPEN_MINUTES = 9 * 60 + 30; // 09:30
export const MARKET_CLOSE_MINUTES = 16 * 60; // 16:00

/** Standardised user-facing copy. */
export const MARKET_CLOSED_MESSAGE =
  "Market is closed. Trading hours are 9:30 AM–4:00 PM ET, Monday–Friday.";

const DEFAULT_CLOSE_GRACE_MS = 60_000;

// ── env override ─────────────────────────────────────────────────────────────

/**
 * Server-only dev override. Ignored when NODE_ENV === "production".
 * Not exposed to the client; UI may briefly show "closed" while the server
 * allows actions — acceptable for dev.
 */
function forceOpenEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.MC_FORCE_MARKET_OPEN === "1";
}

// ── helpers ──────────────────────────────────────────────────────────────────

type EtParts = {
  weekday: string;
  year: number;
  month: number; // 1–12
  day: number; // 1–31
  hour: number; // 0–23
  minute: number; // 0–59
  second: number; // 0–59
};

const ET_PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: TRADING_TIMEZONE,
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function etPartsFor(nowMs: number): EtParts {
  const parts = Object.fromEntries(
    ET_PARTS_FORMATTER.formatToParts(new Date(nowMs)).map((p) => [
      p.type,
      p.value,
    ])
  ) as Record<string, string>;

  // Intl returns "24" for midnight in some Node/ICU versions when hour12=false;
  // normalise to 0 so totalMinutes math is correct.
  const rawHour = parseInt(parts.hour, 10);
  const hour = rawHour === 24 ? 0 : rawHour;

  return {
    weekday: parts.weekday,
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    hour,
    minute: parseInt(parts.minute, 10),
    second: parseInt(parts.second, 10),
  };
}

function isTradingWeekday(weekday: string): boolean {
  return (TRADING_DAYS as readonly string[]).includes(weekday);
}

function totalMinutesFromParts(p: EtParts): number {
  return p.hour * 60 + p.minute;
}

/**
 * Resolve the UTC epoch ms for a given wall-clock (year, month, day, hour,
 * minute) in America/New_York. Uses the `Intl` formatter to discover the
 * offset for that date (handles DST correctly).
 */
function etWallClockToUtcMs(
  year: number,
  month: number, // 1–12
  day: number,
  hour: number,
  minute: number
): number {
  // Initial UTC guess as if the wall clock were UTC.
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);

  // Ask the formatter what wall-clock time `guess` lands at in ET; the delta
  // between that and the target wall-clock gives the offset. One pass is
  // enough because the offset is constant within any single calendar date
  // outside the DST jump itself (and we never land on the missing hour at
  // 09:30 / 16:00 — both are well clear of the 02:00–03:00 spring-forward
  // gap).
  const parts = etPartsFor(guess);
  const asEtMinutes =
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) /
    60_000;
  const targetMinutes = Date.UTC(year, month - 1, day, hour, minute) / 60_000;
  const offsetMinutes = asEtMinutes - targetMinutes;
  return guess - offsetMinutes * 60_000;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Days to add to `weekday` to reach the next trading weekday (Mon–Fri).
 * Returns 0 when `weekday` itself is a trading day.
 */
function daysUntilNextTradingDay(weekday: string): number {
  const idx = WEEKDAY_INDEX[weekday];
  if (idx === undefined) return 0;
  if (idx === 0) return 1; // Sun → Mon
  if (idx === 6) return 2; // Sat → Mon
  return 0; // Mon–Fri
}

/**
 * Days to add to today's ET date to reach the *next* trading day after today.
 * Used when today's open has already passed.
 */
function daysUntilNextTradingDayAfterToday(weekday: string): number {
  const idx = WEEKDAY_INDEX[weekday];
  if (idx === undefined) return 1;
  if (idx === 5) return 3; // Fri → Mon
  if (idx === 6) return 2; // Sat → Mon
  return 1; // Sun → Mon, Mon → Tue, …, Thu → Fri
}

function addDaysToEtDate(
  year: number,
  month: number,
  day: number,
  add: number
): { year: number; month: number; day: number } {
  // Use Date.UTC to perform calendar arithmetic; this is purely day-grain so
  // DST doesn't affect it.
  const ms = Date.UTC(year, month - 1, day) + add * 86_400_000;
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

// ── public API ───────────────────────────────────────────────────────────────

/** Compose a call-site-specific suffix, e.g. "(cannot activate trader)". */
export function marketClosedMessage(reasonSuffix?: string): string {
  if (!reasonSuffix) return MARKET_CLOSED_MESSAGE;
  return `${MARKET_CLOSED_MESSAGE} ${reasonSuffix}`;
}

/** Pure boolean check. Respects MC_FORCE_MARKET_OPEN dev override. */
export function isTradingHours(now: number = Date.now()): boolean {
  if (forceOpenEnabled()) return true;
  const parts = etPartsFor(now);
  if (!isTradingWeekday(parts.weekday)) return false;
  const totalMinutes = totalMinutesFromParts(parts);
  return (
    totalMinutes >= MARKET_OPEN_MINUTES && totalMinutes < MARKET_CLOSE_MINUTES
  );
}

/** Rich status object used by UI + error responses. */
export function getTradingHoursState(now: number = Date.now()): {
  isOpen: boolean;
  reason?: "weekend" | "before_open" | "after_close";
  nextOpenAt?: number;
  nextCloseAt?: number;
  timezone: typeof TRADING_TIMEZONE;
} {
  if (forceOpenEnabled()) {
    return { isOpen: true, timezone: TRADING_TIMEZONE };
  }

  const parts = etPartsFor(now);
  const isWeekday = isTradingWeekday(parts.weekday);
  const totalMinutes = totalMinutesFromParts(parts);

  if (
    isWeekday &&
    totalMinutes >= MARKET_OPEN_MINUTES &&
    totalMinutes < MARKET_CLOSE_MINUTES
  ) {
    const nextCloseAt = etWallClockToUtcMs(
      parts.year,
      parts.month,
      parts.day,
      Math.floor(MARKET_CLOSE_MINUTES / 60),
      MARKET_CLOSE_MINUTES % 60
    );
    return { isOpen: true, nextCloseAt, timezone: TRADING_TIMEZONE };
  }

  // Closed. Determine reason + nextOpenAt.
  let reason: "weekend" | "before_open" | "after_close";
  let addDays: number;
  if (!isWeekday) {
    reason = "weekend";
    addDays = daysUntilNextTradingDay(parts.weekday);
    if (addDays === 0) addDays = 1; // safety; shouldn't hit
  } else if (totalMinutes < MARKET_OPEN_MINUTES) {
    reason = "before_open";
    addDays = 0;
  } else {
    reason = "after_close";
    addDays = daysUntilNextTradingDayAfterToday(parts.weekday);
  }

  const target = addDaysToEtDate(parts.year, parts.month, parts.day, addDays);
  const nextOpenAt = etWallClockToUtcMs(
    target.year,
    target.month,
    target.day,
    Math.floor(MARKET_OPEN_MINUTES / 60),
    MARKET_OPEN_MINUTES % 60
  );

  return { isOpen: false, reason, nextOpenAt, timezone: TRADING_TIMEZONE };
}

/** Throws a normal Error with marketClosedMessage(reasonSuffix). */
export function assertTradingHours(
  now: number = Date.now(),
  reasonSuffix?: string
): void {
  if (isTradingHours(now)) return;
  throw new Error(marketClosedMessage(reasonSuffix));
}

/**
 * Close-edge grace window for already-on-chain settlements.
 *
 * Returns true if (a) we're inside normal trading hours, OR (b) we're past
 * 16:00 ET by at most `graceMs` on a trading weekday. Pre-open has no grace —
 * nothing legitimate should be racing the bell from before.
 */
export function isTradingHoursWithCloseGrace(
  now: number = Date.now(),
  graceMs: number = DEFAULT_CLOSE_GRACE_MS
): boolean {
  if (forceOpenEnabled()) return true;
  if (isTradingHours(now)) return true;

  const parts = etPartsFor(now);
  if (!isTradingWeekday(parts.weekday)) return false;
  const totalMinutes = totalMinutesFromParts(parts);
  if (totalMinutes < MARKET_CLOSE_MINUTES) return false; // pre-open: no grace

  // We're after 16:00 ET on a trading weekday. Compute ms since close.
  const closeMs = etWallClockToUtcMs(
    parts.year,
    parts.month,
    parts.day,
    Math.floor(MARKET_CLOSE_MINUTES / 60),
    MARKET_CLOSE_MINUTES % 60
  );
  return now - closeMs <= graceMs;
}

/**
 * Throws unless `isTradingHoursWithCloseGrace(now, graceMs)` is true.
 * Used by `recordOnChainCreation` so a settlement that surfaces to Convex
 * within `graceMs` past 16:00 isn't stranded.
 */
export function assertTradingHoursWithCloseGrace(
  now: number = Date.now(),
  reasonSuffix?: string,
  graceMs: number = DEFAULT_CLOSE_GRACE_MS
): void {
  if (isTradingHoursWithCloseGrace(now, graceMs)) return;
  throw new Error(marketClosedMessage(reasonSuffix));
}

/**
 * Epoch ms for today's 09:30 ET (market open) based on the New York calendar
 * date of `now`. Returns the open instant for *that* calendar day regardless of
 * whether it's a trading weekday — callers gate on `isTradingHours` separately
 * (e.g. for the "first cycle of trading day" check, the caller already knows
 * `marketOpen === true`, so today's open exists by definition).
 *
 * The dev `MC_FORCE_MARKET_OPEN` override is intentionally NOT applied here:
 * this helper computes a real wall-clock anchor used for date-keyed logic
 * (dedupe keys, "today's open"), not a permission check.
 */
export function getTodayOpenMs(now: number = Date.now()): number {
  const parts = etPartsFor(now);
  return etWallClockToUtcMs(
    parts.year,
    parts.month,
    parts.day,
    Math.floor(MARKET_OPEN_MINUTES / 60),
    MARKET_OPEN_MINUTES % 60
  );
}

/**
 * Today's calendar date in `America/New_York` as ISO `YYYY-MM-DD`. Stable for
 * use in dedupe keys (e.g. one event per trader per trading day).
 */
export function getTodayDateNY(now: number = Date.now()): string {
  const parts = etPartsFor(now);
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  return `${parts.year}-${mm}-${dd}`;
}
