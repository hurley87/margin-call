import { describe, expect, it } from "vitest";
import type { TheaterLive } from "@/hooks/use-round-theater";
import {
  deriveCrashStageMode,
  type CrashStageModeInput,
} from "./use-crash-stage-mode";

const timeline = {
  roundId: 12n,
  phase: "open" as const,
  segments: [],
  countdown: { kind: "entry-closes" as const, seconds: 22 },
  expiresInSeconds: null,
};

function openLive(): Extract<TheaterLive, { kind: "open" }> {
  return {
    kind: "open",
    roundId: 12n,
    phaseLabel: "open",
    tape: null,
    timeline,
  };
}

function delayedLive(): Extract<TheaterLive, { kind: "delayed" }> {
  return {
    kind: "delayed",
    roundId: 12n,
    phaseLabel: "locked",
    tape: null,
    timeline: {
      ...timeline,
      phase: "locked",
      countdown: { kind: "next-opens", seconds: 10 },
    },
  };
}

function finalizedLive(): Extract<TheaterLive, { kind: "finalized" }> {
  return {
    kind: "finalized",
    roundId: 12n,
    crashPointBps: 25_000n,
    displayCrashPoint: "2.50x",
    finalizedAtSeconds: 1_700_000_000n,
    chainTimestamp: 1_700_000_010n,
    finalizeTransactionUrl: null,
    tape: null,
    tiers: [],
    timeline: {
      ...timeline,
      phase: "finalized",
      countdown: { kind: "next-opens", seconds: 5 },
    },
  };
}

function baseInput(
  overrides: Partial<CrashStageModeInput> = {}
): CrashStageModeInput {
  return {
    live: openLive(),
    ceremonyPhase: "idle",
    hasUnsettledTicket: false,
    hasStaleUnsettledTicket: false,
    mayClimb: true,
    hasReplayHero: false,
    isReplayComplete: false,
    ...overrides,
  };
}

describe("deriveCrashStageMode", () => {
  it("returns loading and error from live kind", () => {
    expect(deriveCrashStageMode(baseInput({ live: { kind: "loading" } }))).toBe(
      "loading"
    );
    expect(
      deriveCrashStageMode(
        baseInput({ live: { kind: "error", error: "boom" } })
      )
    ).toBe("error");
  });

  it("shows countdown while entry is open without a held replay", () => {
    expect(deriveCrashStageMode(baseInput())).toBe("countdown");
  });

  it("gates personal replay until mayClimb", () => {
    expect(
      deriveCrashStageMode(
        baseInput({
          live: finalizedLive(),
          hasUnsettledTicket: true,
          mayClimb: false,
          hasReplayHero: true,
        })
      )
    ).toBe("awaiting-settle");

    expect(
      deriveCrashStageMode(
        baseInput({
          live: finalizedLive(),
          hasUnsettledTicket: true,
          mayClimb: true,
          hasReplayHero: true,
          isReplayComplete: false,
        })
      )
    ).toBe("replay");
  });

  it("shows spectator replay after finalize without a ticket", () => {
    expect(
      deriveCrashStageMode(
        baseInput({
          live: finalizedLive(),
          hasUnsettledTicket: false,
          mayClimb: true,
          hasReplayHero: true,
          isReplayComplete: false,
        })
      )
    ).toBe("replay");
  });

  it("moves to outcome when the climb completes", () => {
    expect(
      deriveCrashStageMode(
        baseInput({
          live: finalizedLive(),
          hasUnsettledTicket: false,
          mayClimb: true,
          hasReplayHero: true,
          isReplayComplete: true,
        })
      )
    ).toBe("outcome");
  });

  it("keeps awaiting-settle while delayed with an unsettled ticket", () => {
    expect(
      deriveCrashStageMode(
        baseInput({
          live: delayedLive(),
          hasUnsettledTicket: true,
          mayClimb: false,
        })
      )
    ).toBe("awaiting-settle");
  });

  it("returns expired for expired live", () => {
    expect(
      deriveCrashStageMode(
        baseInput({
          live: {
            kind: "expired",
            roundId: 12n,
            tape: null,
            timeline,
          },
        })
      )
    ).toBe("expired");
  });

  it("lets the ceremony take over every ready live kind", () => {
    for (const live of [openLive(), delayedLive(), finalizedLive()]) {
      expect(
        deriveCrashStageMode(baseInput({ live, ceremonyPhase: "verifying" }))
      ).toBe("settling");
      expect(
        deriveCrashStageMode(baseInput({ live, ceremonyPhase: "climbing" }))
      ).toBe("replay");
      expect(
        deriveCrashStageMode(baseInput({ live, ceremonyPhase: "landed" }))
      ).toBe("outcome");
    }
  });

  it("holds a landed ceremony across a flip to the next open round", () => {
    expect(
      deriveCrashStageMode(
        baseInput({
          live: openLive(),
          ceremonyPhase: "landed",
          hasUnsettledTicket: false,
          mayClimb: true,
        })
      )
    ).toBe("outcome");
  });

  it("blocks the next round's countdown behind a stale unsettled ticket", () => {
    expect(
      deriveCrashStageMode(
        baseInput({
          live: openLive(),
          hasUnsettledTicket: true,
          hasStaleUnsettledTicket: true,
          mayClimb: false,
        })
      )
    ).toBe("awaiting-settle");
  });

  it("keeps expired routing to refund over the stale-ticket gate", () => {
    expect(
      deriveCrashStageMode(
        baseInput({
          live: {
            kind: "expired",
            roundId: 12n,
            tape: null,
            timeline,
          },
          hasUnsettledTicket: true,
          hasStaleUnsettledTicket: true,
          mayClimb: false,
        })
      )
    ).toBe("expired");
  });

  it("still returns loading and error over an active ceremony", () => {
    expect(
      deriveCrashStageMode(
        baseInput({ live: { kind: "loading" }, ceremonyPhase: "verifying" })
      )
    ).toBe("loading");
    expect(
      deriveCrashStageMode(
        baseInput({
          live: { kind: "error", error: "boom" },
          ceremonyPhase: "landed",
        })
      )
    ).toBe("error");
  });
});
