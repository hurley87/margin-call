/**
 * Unit tests for `convex/lib/tradingHours.ts`.
 *
 * Timestamps are built with `Date.UTC(...)` using the offset that applied on
 * that ET date:
 *   - EDT (Mar–Nov, daylight) = UTC−4 → ET wall clock + 4h = UTC
 *   - EST (Nov–Mar, standard) = UTC−5 → ET wall clock + 5h = UTC
 *
 * `now` is injected directly on every call; no fake timers.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MARKET_CLOSED_MESSAGE,
  TRADING_TIMEZONE,
  assertTradingHours,
  assertTradingHoursWithCloseGrace,
  getTradingHoursState,
  isTradingHours,
  isTradingHoursWithCloseGrace,
  marketClosedMessage,
} from "../../convex/lib/tradingHours";

// ── isTradingHours: open/close edges (Mon 2026-05-04, EDT = UTC−4) ───────────

describe("isTradingHours: open/close edges", () => {
  // Mon 2026-05-04 09:29:59 ET (EDT, UTC−4) → 13:29:59 UTC
  const monBeforeOpen = Date.UTC(2026, 4, 4, 13, 29, 59);
  // Mon 2026-05-04 09:30:00 ET → 13:30:00 UTC
  const monAtOpen = Date.UTC(2026, 4, 4, 13, 30, 0);
  // Mon 2026-05-04 15:59:59 ET → 19:59:59 UTC
  const monBeforeClose = Date.UTC(2026, 4, 4, 19, 59, 59);
  // Mon 2026-05-04 16:00:00 ET → 20:00:00 UTC
  const monAtClose = Date.UTC(2026, 4, 4, 20, 0, 0);

  it("Monday 09:29:59 ET → closed", () => {
    expect(isTradingHours(monBeforeOpen)).toBe(false);
  });

  it("Monday 09:30:00 ET → open", () => {
    expect(isTradingHours(monAtOpen)).toBe(true);
  });

  it("Monday 15:59:59 ET → open", () => {
    expect(isTradingHours(monBeforeClose)).toBe(true);
  });

  it("Monday 16:00:00 ET → closed (close is exclusive)", () => {
    expect(isTradingHours(monAtClose)).toBe(false);
  });
});

// ── isTradingHours: weekdays / weekends ──────────────────────────────────────

describe("isTradingHours: weekdays and weekends", () => {
  // Fri 2026-05-08 12:00 ET (EDT) → 16:00 UTC
  const friMidday = Date.UTC(2026, 4, 8, 16, 0, 0);
  // Sat 2026-05-09 12:00 ET (EDT) → 16:00 UTC
  const satMidday = Date.UTC(2026, 4, 9, 16, 0, 0);
  // Sun 2026-05-10 12:00 ET (EDT) → 16:00 UTC
  const sunMidday = Date.UTC(2026, 4, 10, 16, 0, 0);

  it("Friday 12:00 ET → open", () => {
    expect(isTradingHours(friMidday)).toBe(true);
  });

  it("Saturday noon ET → closed", () => {
    expect(isTradingHours(satMidday)).toBe(false);
  });

  it("Sunday noon ET → closed", () => {
    expect(isTradingHours(sunMidday)).toBe(false);
  });
});

// ── isTradingHours: DST transitions ──────────────────────────────────────────

describe("isTradingHours: DST safety", () => {
  // Spring forward 2026: clocks jump 02:00 EST → 03:00 EDT on Sun 2026-03-08.
  // Mon 2026-03-09 10:00 ET (EDT, UTC−4) → 14:00 UTC.
  const monAfterSpringForward = Date.UTC(2026, 2, 9, 14, 0, 0);

  // Fall back 2026: clocks jump 02:00 EDT → 01:00 EST on Sun 2026-11-01.
  // Mon 2026-11-02 10:00 ET (EST, UTC−5) → 15:00 UTC.
  const monAfterFallBack = Date.UTC(2026, 10, 2, 15, 0, 0);

  it("Monday 2026-03-09 10:00 ET (after spring forward) → open", () => {
    expect(isTradingHours(monAfterSpringForward)).toBe(true);
  });

  it("Monday 2026-11-02 10:00 ET (after fall back) → open", () => {
    expect(isTradingHours(monAfterFallBack)).toBe(true);
  });
});

// ── getTradingHoursState ─────────────────────────────────────────────────────

describe("getTradingHoursState", () => {
  it("open during trading hours, returns nextCloseAt today, no reason", () => {
    // Mon 2026-05-04 10:00 ET (EDT) → 14:00 UTC
    const now = Date.UTC(2026, 4, 4, 14, 0, 0);
    const state = getTradingHoursState(now);
    expect(state.isOpen).toBe(true);
    expect(state.reason).toBeUndefined();
    expect(state.nextOpenAt).toBeUndefined();
    expect(state.timezone).toBe(TRADING_TIMEZONE);
    // Close at Mon 2026-05-04 16:00 ET → 20:00 UTC
    expect(state.nextCloseAt).toBe(Date.UTC(2026, 4, 4, 20, 0, 0));
  });

  it("Friday 17:00 ET → nextOpenAt is following Monday 09:30 ET (64.5h delta)", () => {
    // Fri 2026-05-08 17:00 ET (EDT) → 21:00 UTC
    const friEvening = Date.UTC(2026, 4, 8, 21, 0, 0);
    // Mon 2026-05-11 09:30 ET (EDT) → 13:30 UTC
    const monOpen = Date.UTC(2026, 4, 11, 13, 30, 0);

    const state = getTradingHoursState(friEvening);
    expect(state.isOpen).toBe(false);
    expect(state.reason).toBe("after_close");
    expect(state.nextCloseAt).toBeUndefined();
    expect(state.nextOpenAt).toBe(monOpen);
    // Sanity: 64.5h delta.
    expect((state.nextOpenAt! - friEvening) / (60 * 60 * 1000)).toBeCloseTo(
      64.5,
      6
    );
  });

  it("Saturday → weekend reason, nextOpenAt is Monday open", () => {
    // Sat 2026-05-09 12:00 ET (EDT) → 16:00 UTC
    const sat = Date.UTC(2026, 4, 9, 16, 0, 0);
    const monOpen = Date.UTC(2026, 4, 11, 13, 30, 0);
    const state = getTradingHoursState(sat);
    expect(state.isOpen).toBe(false);
    expect(state.reason).toBe("weekend");
    expect(state.nextOpenAt).toBe(monOpen);
  });

  it("Sunday → weekend reason, nextOpenAt is Monday open", () => {
    // Sun 2026-05-10 12:00 ET (EDT) → 16:00 UTC
    const sun = Date.UTC(2026, 4, 10, 16, 0, 0);
    const monOpen = Date.UTC(2026, 4, 11, 13, 30, 0);
    const state = getTradingHoursState(sun);
    expect(state.isOpen).toBe(false);
    expect(state.reason).toBe("weekend");
    expect(state.nextOpenAt).toBe(monOpen);
  });

  it("Tuesday pre-open → before_open reason, nextOpenAt is same day open", () => {
    // Tue 2026-05-05 08:00 ET (EDT) → 12:00 UTC
    const preOpen = Date.UTC(2026, 4, 5, 12, 0, 0);
    // Tue 2026-05-05 09:30 ET → 13:30 UTC
    const tueOpen = Date.UTC(2026, 4, 5, 13, 30, 0);
    const state = getTradingHoursState(preOpen);
    expect(state.isOpen).toBe(false);
    expect(state.reason).toBe("before_open");
    expect(state.nextOpenAt).toBe(tueOpen);
  });
});

// ── isTradingHoursWithCloseGrace ─────────────────────────────────────────────

describe("isTradingHoursWithCloseGrace", () => {
  // Mon 2026-05-04 16:00:30 ET (EDT) → 20:00:30 UTC (30s past close)
  const monThirtySecPastClose = Date.UTC(2026, 4, 4, 20, 0, 30);
  // Mon 2026-05-04 16:01:30 ET → 20:01:30 UTC (90s past close)
  const monNinetySecPastClose = Date.UTC(2026, 4, 4, 20, 1, 30);

  it("16:00:30 with default 60s grace → true", () => {
    expect(isTradingHoursWithCloseGrace(monThirtySecPastClose)).toBe(true);
  });

  it("16:01:30 with default 60s grace → false", () => {
    expect(isTradingHoursWithCloseGrace(monNinetySecPastClose)).toBe(false);
  });

  it("during normal trading hours → true", () => {
    // Mon 2026-05-04 10:00 ET → 14:00 UTC
    expect(isTradingHoursWithCloseGrace(Date.UTC(2026, 4, 4, 14, 0, 0))).toBe(
      true
    );
  });

  it("pre-open has no grace", () => {
    // Mon 2026-05-04 09:29:30 ET → 13:29:30 UTC
    expect(isTradingHoursWithCloseGrace(Date.UTC(2026, 4, 4, 13, 29, 30))).toBe(
      false
    );
  });

  it("Saturday past close window → false", () => {
    // Sat 2026-05-09 12:00 ET → 16:00 UTC
    expect(isTradingHoursWithCloseGrace(Date.UTC(2026, 4, 9, 16, 0, 0))).toBe(
      false
    );
  });
});

// ── assertTradingHours / assertTradingHoursWithCloseGrace ────────────────────

describe("assertTradingHours", () => {
  it("does not throw inside trading hours", () => {
    // Mon 2026-05-04 10:00 ET → 14:00 UTC
    expect(() =>
      assertTradingHours(Date.UTC(2026, 4, 4, 14, 0, 0))
    ).not.toThrow();
  });

  it("throws with MARKET_CLOSED_MESSAGE outside trading hours", () => {
    // Sat 2026-05-09 12:00 ET → 16:00 UTC
    expect(() => assertTradingHours(Date.UTC(2026, 4, 9, 16, 0, 0))).toThrow(
      MARKET_CLOSED_MESSAGE
    );
  });

  it("appends reason suffix when provided", () => {
    // Sat 2026-05-09 12:00 ET → 16:00 UTC
    expect(() =>
      assertTradingHours(
        Date.UTC(2026, 4, 9, 16, 0, 0),
        "(cannot activate trader)"
      )
    ).toThrow(`${MARKET_CLOSED_MESSAGE} (cannot activate trader)`);
  });
});

describe("assertTradingHoursWithCloseGrace", () => {
  it("does not throw within close grace window", () => {
    // Mon 2026-05-04 16:00:30 ET → 20:00:30 UTC
    expect(() =>
      assertTradingHoursWithCloseGrace(Date.UTC(2026, 4, 4, 20, 0, 30))
    ).not.toThrow();
  });

  it("throws past close grace window", () => {
    // Mon 2026-05-04 16:01:30 ET → 20:01:30 UTC
    expect(() =>
      assertTradingHoursWithCloseGrace(Date.UTC(2026, 4, 4, 20, 1, 30))
    ).toThrow(MARKET_CLOSED_MESSAGE);
  });

  it("appends reason suffix when provided", () => {
    // Sat 2026-05-09 12:00 ET → 16:00 UTC
    expect(() =>
      assertTradingHoursWithCloseGrace(
        Date.UTC(2026, 4, 9, 16, 0, 0),
        "(cannot record on-chain creation)"
      )
    ).toThrow(`${MARKET_CLOSED_MESSAGE} (cannot record on-chain creation)`);
  });
});

// ── marketClosedMessage ──────────────────────────────────────────────────────

describe("marketClosedMessage", () => {
  it("returns base message when no suffix", () => {
    expect(marketClosedMessage()).toBe(MARKET_CLOSED_MESSAGE);
  });

  it("appends suffix with a single space", () => {
    expect(marketClosedMessage("(cannot activate trader)")).toBe(
      `${MARKET_CLOSED_MESSAGE} (cannot activate trader)`
    );
  });
});

// ── MC_FORCE_MARKET_OPEN env override ────────────────────────────────────────

describe("MC_FORCE_MARKET_OPEN dev override", () => {
  const originalForce = process.env.MC_FORCE_MARKET_OPEN;
  const originalEnv = process.env.NODE_ENV;

  // Sat 2026-05-09 12:00 ET → 16:00 UTC (definitively closed)
  const definitelyClosed = Date.UTC(2026, 4, 9, 16, 0, 0);

  beforeEach(() => {
    delete process.env.MC_FORCE_MARKET_OPEN;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    if (originalForce === undefined) {
      delete process.env.MC_FORCE_MARKET_OPEN;
    } else {
      process.env.MC_FORCE_MARKET_OPEN = originalForce;
    }
    if (originalEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("MC_FORCE_MARKET_OPEN=1 in NODE_ENV=development → always open", () => {
    process.env.MC_FORCE_MARKET_OPEN = "1";
    process.env.NODE_ENV = "development";
    expect(isTradingHours(definitelyClosed)).toBe(true);
    expect(isTradingHoursWithCloseGrace(definitelyClosed)).toBe(true);
    expect(() => assertTradingHours(definitelyClosed)).not.toThrow();
    expect(() =>
      assertTradingHoursWithCloseGrace(definitelyClosed)
    ).not.toThrow();
    const state = getTradingHoursState(definitelyClosed);
    expect(state.isOpen).toBe(true);
    expect(state.reason).toBeUndefined();
  });

  it("MC_FORCE_MARKET_OPEN=1 in NODE_ENV=production → ignored", () => {
    process.env.MC_FORCE_MARKET_OPEN = "1";
    process.env.NODE_ENV = "production";
    expect(isTradingHours(definitelyClosed)).toBe(false);
    expect(isTradingHoursWithCloseGrace(definitelyClosed)).toBe(false);
    expect(() => assertTradingHours(definitelyClosed)).toThrow(
      MARKET_CLOSED_MESSAGE
    );
    expect(() => assertTradingHoursWithCloseGrace(definitelyClosed)).toThrow(
      MARKET_CLOSED_MESSAGE
    );
    const state = getTradingHoursState(definitelyClosed);
    expect(state.isOpen).toBe(false);
    expect(state.reason).toBe("weekend");
  });

  it("MC_FORCE_MARKET_OPEN unset → normal rules apply", () => {
    process.env.NODE_ENV = "development";
    expect(isTradingHours(definitelyClosed)).toBe(false);
  });
});
