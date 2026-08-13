import { describe, expect, it } from "vitest";
import { ROUND_STATUS, type CrashRound } from "./margin-call-crash";
import {
  formatEntriesReopenNotice,
  formatNextRoundHandoff,
  formatTimelineCountdown,
} from "./round-phase-copy";
import { getRoundTimeline, ROUND_INTERVAL_SECONDS } from "./round-timeline";

const OPEN_AT = 1_000n;
const LOCK_AT = OPEN_AT + 45n;
const EXPIRES_AT = LOCK_AT + 900n;

function makeRound(overrides: Partial<CrashRound> = {}): CrashRound {
  return {
    id: 12n,
    openAt: OPEN_AT,
    lockAt: LOCK_AT,
    expiresAt: EXPIRES_AT,
    crashRandom: `0x${"ab".repeat(32)}`,
    crashPointBps: 0n,
    totalMargin: 0n,
    reservedPayout: 0n,
    status: ROUND_STATUS.open,
    ...overrides,
  };
}

function segmentState(round: CrashRound, ts: bigint, id: string) {
  return getRoundTimeline(round, ts).segments.find((s) => s.id === id);
}

describe("getRoundTimeline", () => {
  it("always returns the five segments in lifecycle order", () => {
    const timeline = getRoundTimeline(makeRound(), OPEN_AT);
    expect(timeline.segments.map((s) => s.id)).toEqual([
      "entry",
      "locked",
      "reveal",
      "result",
      "next",
    ]);
  });

  it("marks entry active with grid progress during the open phase", () => {
    const timeline = getRoundTimeline(makeRound(), OPEN_AT + 22n);
    expect(timeline.phase).toBe("open");
    const entry = timeline.segments[0];
    expect(entry.state).toBe("active");
    expect(entry.progress).toBeCloseTo(22 / 45, 5);
    expect(timeline.countdown).toEqual({ kind: "entry-closes", seconds: 23 });
    expect(timeline.expiresInSeconds).toBeNull();
  });

  it("keeps prelaunch at zero progress with the full entry countdown", () => {
    const round = makeRound({ status: ROUND_STATUS.uninitialized });
    const timeline = getRoundTimeline(round, OPEN_AT - 10n);
    expect(timeline.phase).toBe("prelaunch");
    expect(timeline.segments[0].progress).toBe(0);
    expect(timeline.countdown).toEqual({ kind: "entry-closes", seconds: 55 });
  });

  it("falls back to the next-opens countdown for a stale uninitialized epoch", () => {
    const round = makeRound({ status: ROUND_STATUS.uninitialized });
    const timeline = getRoundTimeline(round, LOCK_AT + 5n);
    expect(timeline.phase).toBe("uninitialized");
    expect(timeline.segments[0].progress).toBe(1);
    expect(timeline.countdown).toEqual({ kind: "next-opens", seconds: 10 });
  });

  it("shows locked with the next-opens countdown and an expiry horizon", () => {
    const timeline = getRoundTimeline(makeRound(), LOCK_AT + 3n);
    expect(timeline.phase).toBe("locked");
    expect(segmentState(makeRound(), LOCK_AT + 3n, "entry")?.state).toBe(
      "done"
    );
    expect(segmentState(makeRound(), LOCK_AT + 3n, "locked")?.state).toBe(
      "active"
    );
    expect(timeline.countdown).toEqual({ kind: "next-opens", seconds: 12 });
    expect(timeline.expiresInSeconds).toBe(897);
  });

  it("marks reveal active while awaiting attestation", () => {
    const round = makeRound({ status: ROUND_STATUS.revealRequested });
    const ts = LOCK_AT + 8n;
    const timeline = getRoundTimeline(round, ts);
    expect(timeline.phase).toBe("reveal-requested");
    expect(segmentState(round, ts, "reveal")?.state).toBe("active");
    expect(segmentState(round, ts, "reveal")?.progress).toBeNull();
    expect(timeline.countdown.kind).toBe("next-opens");
  });

  it("marks everything done and next active once finalized", () => {
    const round = makeRound({
      status: ROUND_STATUS.finalized,
      crashPointBps: 25_000n,
    });
    const ts = LOCK_AT + 10n;
    const timeline = getRoundTimeline(round, ts);
    expect(timeline.phase).toBe("finalized");
    expect(timeline.segments.map((s) => s.state)).toEqual([
      "done",
      "done",
      "done",
      "done",
      "active",
    ]);
    expect(timeline.segments[4].progress).toBeCloseTo(55 / 60, 5);
    expect(timeline.countdown).toEqual({ kind: "next-opens", seconds: 5 });
  });

  it("clamps the next-opens countdown to zero past the boundary", () => {
    const round = makeRound({
      status: ROUND_STATUS.finalized,
      crashPointBps: 25_000n,
    });
    const timeline = getRoundTimeline(
      round,
      OPEN_AT + ROUND_INTERVAL_SECONDS + 30n
    );
    expect(timeline.countdown).toEqual({ kind: "next-opens", seconds: 0 });
    expect(timeline.segments[4].progress).toBe(1);
  });

  it("skips reveal and result for expired rounds without inventing progress", () => {
    const round = makeRound({ status: ROUND_STATUS.expired });
    const ts = EXPIRES_AT + 100n;
    const timeline = getRoundTimeline(round, ts);
    expect(timeline.phase).toBe("expired");
    expect(segmentState(round, ts, "reveal")?.state).toBe("skipped");
    expect(segmentState(round, ts, "result")?.state).toBe("skipped");
    expect(timeline.expiresInSeconds).toBeNull();
  });

  it("keeps the expiry countdown while expiry is merely eligible", () => {
    const round = makeRound({ status: ROUND_STATUS.open });
    const ts = EXPIRES_AT + 1n;
    const timeline = getRoundTimeline(round, ts);
    expect(timeline.phase).toBe("expired-eligible");
    expect(timeline.expiresInSeconds).toBe(0);
    expect(timeline.countdown.kind).toBe("next-opens");
  });

  it("locks active, skipped, and expiry clocks for every phase", () => {
    const cases = [
      {
        round: { status: ROUND_STATUS.uninitialized },
        ts: OPEN_AT - 10n,
        phase: "prelaunch",
        active: "entry",
        skipped: [],
        expiresOn: false,
      },
      {
        round: { status: ROUND_STATUS.uninitialized },
        ts: OPEN_AT + 1n,
        phase: "uninitialized",
        active: "entry",
        skipped: [],
        expiresOn: false,
      },
      {
        round: {},
        ts: OPEN_AT,
        phase: "open",
        active: "entry",
        skipped: [],
        expiresOn: false,
      },
      {
        round: {},
        ts: LOCK_AT,
        phase: "locked",
        active: "locked",
        skipped: [],
        expiresOn: true,
      },
      {
        round: { status: ROUND_STATUS.revealRequested },
        ts: LOCK_AT + 1n,
        phase: "reveal-requested",
        active: "reveal",
        skipped: [],
        expiresOn: true,
      },
      {
        round: { status: ROUND_STATUS.finalized, crashPointBps: 25_000n },
        ts: LOCK_AT + 1n,
        phase: "finalized",
        active: "next",
        skipped: [],
        expiresOn: false,
      },
      {
        round: {},
        ts: EXPIRES_AT + 1n,
        phase: "expired-eligible",
        active: "next",
        skipped: ["reveal", "result"],
        expiresOn: true,
      },
      {
        round: { status: ROUND_STATUS.expired },
        ts: EXPIRES_AT + 1n,
        phase: "expired",
        active: "next",
        skipped: ["reveal", "result"],
        expiresOn: false,
      },
    ] as const;

    for (const c of cases) {
      const timeline = getRoundTimeline(makeRound(c.round), c.ts);
      expect(timeline.phase).toBe(c.phase);
      expect(
        timeline.segments.filter((s) => s.state === "active").map((s) => s.id)
      ).toEqual([c.active]);
      expect(
        timeline.segments.filter((s) => s.state === "skipped").map((s) => s.id)
      ).toEqual([...c.skipped]);
      expect(timeline.expiresInSeconds !== null).toBe(c.expiresOn);
    }
  });
});

describe("countdown formatters", () => {
  it("formats the strip sentence from timeline.countdown", () => {
    const open = getRoundTimeline(makeRound(), OPEN_AT + 22n);
    expect(formatTimelineCountdown(open)).toBe("Entry closes in 00:23");

    const locked = getRoundTimeline(makeRound(), LOCK_AT + 3n);
    expect(formatTimelineCountdown(locked)).toBe("Next round opens in 00:12");
  });

  it("formats the rail notice from next-opens seconds", () => {
    const locked = getRoundTimeline(makeRound(), LOCK_AT + 3n);
    expect(formatEntriesReopenNotice(locked)).toBe("Entries reopen in 00:12");
  });

  it("formats the result handoff without naming the round id", () => {
    expect(formatNextRoundHandoff({ kind: "next-opens", seconds: 5 })).toBe(
      "Next round opens in 00:05"
    );
  });
});
