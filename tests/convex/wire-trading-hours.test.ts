import { describe, it, expect } from "vitest";
import {
  isMarketOpen,
  currentEpochSlot,
  dayPosture,
} from "../../convex/wire/tradingHours";

// ── isMarketOpen ──────────────────────────────────────────────────────────────

describe("isMarketOpen", () => {
  // Mon 2026-05-04 09:30:00 ET (EDT = UTC-4) → 13:30 UTC
  const MON_OPEN = new Date("2026-05-04T13:30:00.000Z").getTime();
  // Mon 2026-05-04 15:59:59 ET → 19:59:59 UTC
  const MON_BEFORE_CLOSE = new Date("2026-05-04T19:59:59.000Z").getTime();
  // Mon 2026-05-04 16:00:00 ET → 20:00:00 UTC
  const MON_AT_CLOSE = new Date("2026-05-04T20:00:00.000Z").getTime();
  // Mon 2026-05-04 09:29:59 ET → 13:29:59 UTC
  const MON_BEFORE_OPEN = new Date("2026-05-04T13:29:59.000Z").getTime();
  // Sat 2026-05-09 12:00 ET → 16:00 UTC
  const SAT_MIDDAY = new Date("2026-05-09T16:00:00.000Z").getTime();
  // Sun 2026-05-10 12:00 ET
  const SUN_MIDDAY = new Date("2026-05-10T16:00:00.000Z").getTime();

  it("returns true at exactly 09:30 ET (market open)", () => {
    expect(isMarketOpen(MON_OPEN)).toBe(true);
  });

  it("returns true at 15:59 ET (one minute before close)", () => {
    expect(isMarketOpen(MON_BEFORE_CLOSE)).toBe(true);
  });

  it("returns false at exactly 16:00 ET (close is exclusive)", () => {
    expect(isMarketOpen(MON_AT_CLOSE)).toBe(false);
  });

  it("returns false at 09:29 ET (one minute before open)", () => {
    expect(isMarketOpen(MON_BEFORE_OPEN)).toBe(false);
  });

  it("returns false on Saturday", () => {
    expect(isMarketOpen(SAT_MIDDAY)).toBe(false);
  });

  it("returns false on Sunday", () => {
    expect(isMarketOpen(SUN_MIDDAY)).toBe(false);
  });

  // DST spring-forward: clocks go from 02:00 EST to 03:00 EDT on 2026-03-08
  // Day after DST: Mon 2026-03-09 09:30 EDT = 13:30 UTC
  it("handles DST spring-forward (March 2026) correctly", () => {
    const monAfterDst = new Date("2026-03-09T13:30:00.000Z").getTime();
    expect(isMarketOpen(monAfterDst)).toBe(true);
  });

  // Before DST: Mon 2026-03-02 09:30 EST = 14:30 UTC
  it("handles EST (before DST) correctly", () => {
    const monBeforeDst = new Date("2026-03-02T14:30:00.000Z").getTime();
    expect(isMarketOpen(monBeforeDst)).toBe(true);
  });

  // DST fall-back: clocks go from 02:00 EDT to 01:00 EST on 2026-11-01
  // Day after: Mon 2026-11-02 09:30 EST = 14:30 UTC
  it("handles DST fall-back (November 2026) correctly", () => {
    const monAfterFallback = new Date("2026-11-02T14:30:00.000Z").getTime();
    expect(isMarketOpen(monAfterFallback)).toBe(true);
  });

  it("returns false on weekdays outside trading hours (early morning ET)", () => {
    // Tue 2026-05-05 06:00 ET = 10:00 UTC
    const tueMorning = new Date("2026-05-05T10:00:00.000Z").getTime();
    expect(isMarketOpen(tueMorning)).toBe(false);
  });

  it("returns false on weekdays outside trading hours (evening ET)", () => {
    // Wed 2026-05-06 20:00 ET = 00:00 UTC next day
    const wedEvening = new Date("2026-05-07T00:00:00.000Z").getTime();
    expect(isMarketOpen(wedEvening)).toBe(false);
  });
});

// ── currentEpochSlot ──────────────────────────────────────────────────────────

describe("currentEpochSlot", () => {
  it("returns the same slot for timestamps within the same clock hour", () => {
    const hour = 1_746_360_000_000; // arbitrary hour boundary in ms
    expect(currentEpochSlot(hour)).toBe(currentEpochSlot(hour + 1));
    expect(currentEpochSlot(hour)).toBe(currentEpochSlot(hour + 3_599_999));
  });

  it("returns a different slot at the start of the next hour", () => {
    const hour = 1_746_360_000_000;
    expect(currentEpochSlot(hour)).not.toBe(currentEpochSlot(hour + 3_600_000));
  });

  it("is monotonically increasing over successive hours", () => {
    const base = 1_746_360_000_000;
    const slots = [0, 1, 2, 3].map((n) =>
      currentEpochSlot(base + n * 3_600_000)
    );
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i]).toBeGreaterThan(slots[i - 1]);
    }
  });

  it("returns consistent slot for the same timestamp (idempotent)", () => {
    const ts = 1_746_363_600_500;
    expect(currentEpochSlot(ts)).toBe(currentEpochSlot(ts));
  });
});

// ── dayPosture ────────────────────────────────────────────────────────────────

describe("dayPosture", () => {
  it("returns 'monday' for a Monday in ET", () => {
    const mon = new Date("2026-05-04T14:00:00.000Z").getTime(); // Mon 10:00 EDT
    expect(dayPosture(mon)).toBe("monday");
  });

  it("returns 'friday' for a Friday in ET", () => {
    const fri = new Date("2026-05-08T14:00:00.000Z").getTime(); // Fri 10:00 EDT
    expect(dayPosture(fri)).toBe("friday");
  });

  it("returns 'wednesday' for a Wednesday in ET", () => {
    const wed = new Date("2026-05-06T14:00:00.000Z").getTime();
    expect(dayPosture(wed)).toBe("wednesday");
  });
});
