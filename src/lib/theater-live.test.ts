import { describe, expect, it } from "vitest";
import type { TheaterLive, TheaterView } from "@/hooks/use-round-theater";
import {
  isTheaterLiveReady,
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
});
