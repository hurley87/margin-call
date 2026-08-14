import { describe, expect, it } from "vitest";
import type { TheaterLive, TheaterView } from "@/hooks/use-round-theater";
import {
  isTheaterLiveReady,
  summarizeTapePot,
  theaterCountdownProgress,
  theaterCountdownSeconds,
  theaterDisplayRoundId,
  theaterLiveRoundId,
  theaterLiveTimeline,
  theaterTapeEntries,
} from "./theater-live";

const timeline = {
  roundId: 12n,
  phase: "open" as const,
  segments: [],
  countdown: { kind: "entry-closes" as const, seconds: 22 },
  expiresInSeconds: null,
};

const openLive: Extract<TheaterLive, { kind: "open" }> = {
  kind: "open",
  roundId: 12n,
  phaseLabel: "open",
  tape: {
    roundId: 12n,
    entries: [
      {
        ticketId: 1n,
        player: "0x00000000000000000000000000000000000000aa",
        margin: 1_000_000n,
        leverageBps: 12_500n,
        reservedPayout: 1_250_000n,
        transactionHash: null,
      },
    ],
    tiers: [],
  },
  timeline,
};

describe("theater-live", () => {
  it("narrows ready vs non-ready live kinds", () => {
    expect(isTheaterLiveReady(openLive)).toBe(true);
    expect(isTheaterLiveReady({ kind: "loading" })).toBe(false);
    expect(isTheaterLiveReady({ kind: "error", error: "boom" })).toBe(false);
  });

  it("reads round id, timeline, and countdown from ready live", () => {
    expect(theaterLiveRoundId(openLive)).toBe(12n);
    expect(theaterLiveTimeline(openLive)).toBe(timeline);
    expect(theaterCountdownSeconds(openLive)).toBe(22);
    expect(theaterLiveRoundId({ kind: "loading" })).toBeNull();
    expect(theaterCountdownSeconds({ kind: "loading" })).toBeNull();
  });

  it("prefers replay hero round id for display", () => {
    expect(
      theaterDisplayRoundId(openLive, {
        type: "replay",
        roundId: 11n,
        crashPointBps: 25_000n,
        displayCrashPoint: "2.50x",
        finalizedAtSeconds: 1n,
        chainTimestamp: 2n,
        finalizeTransactionUrl: null,
        tape: null,
        tiers: [],
      })
    ).toBe(11n);
    expect(theaterDisplayRoundId(openLive, { type: "empty" })).toBe(12n);
  });

  it("reads tape from ready live, else from replay hero", () => {
    const view: TheaterView = {
      live: openLive,
      hero: { type: "empty" },
      reducedMotion: false,
      retry: async () => {},
    };
    expect(theaterTapeEntries(view)).toHaveLength(1);

    const loadingView: TheaterView = {
      live: { kind: "loading" },
      hero: {
        type: "replay",
        roundId: 11n,
        crashPointBps: 25_000n,
        displayCrashPoint: "2.50x",
        finalizedAtSeconds: 1n,
        chainTimestamp: 2n,
        finalizeTransactionUrl: null,
        tape: {
          roundId: 11n,
          entries: openLive.tape!.entries,
          tiers: [],
        },
        tiers: [],
      },
      reducedMotion: false,
      retry: async () => {},
    };
    expect(theaterTapeEntries(loadingView)).toHaveLength(1);
  });

  it("sums tape pot totals from public entries", () => {
    expect(summarizeTapePot([])).toEqual({
      totalMargin: 0n,
      reservedPayout: 0n,
      ticketCount: 0,
    });
    expect(summarizeTapePot(openLive.tape!.entries)).toEqual({
      totalMargin: 1_000_000n,
      reservedPayout: 1_250_000n,
      ticketCount: 1,
    });
    expect(
      summarizeTapePot([
        { margin: 1_000_000n, reservedPayout: 1_250_000n },
        { margin: 5_000_000n, reservedPayout: 10_000_000n },
      ])
    ).toEqual({
      totalMargin: 6_000_000n,
      reservedPayout: 11_250_000n,
      ticketCount: 2,
    });
  });

  it("reads countdown dial progress from the matching timeline segment", () => {
    expect(theaterCountdownProgress(null)).toBeNull();
    expect(
      theaterCountdownProgress({
        ...timeline,
        countdown: { kind: "entry-closes", seconds: 22 },
        segments: [
          { id: "entry", state: "active", progress: 0.37 },
          { id: "locked", state: "upcoming", progress: null },
          { id: "reveal", state: "upcoming", progress: null },
          { id: "result", state: "upcoming", progress: null },
          { id: "next", state: "upcoming", progress: null },
        ],
      })
    ).toBe(0.37);
    expect(
      theaterCountdownProgress({
        ...timeline,
        countdown: { kind: "next-opens", seconds: 12 },
        segments: [
          { id: "entry", state: "done", progress: 1 },
          { id: "locked", state: "done", progress: null },
          { id: "reveal", state: "done", progress: null },
          { id: "result", state: "done", progress: null },
          { id: "next", state: "active", progress: 0.8 },
        ],
      })
    ).toBe(0.8);
  });
});
