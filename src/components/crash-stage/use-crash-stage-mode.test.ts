import { describe, expect, it } from "vitest";
import type { TheaterLive } from "@/hooks/use-round-theater";
import {
  deriveCrashStageMode,
  deriveStageCtaKind,
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
    hasUnsettledTicket: false,
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
});

describe("deriveStageCtaKind", () => {
  it("offers enter during open countdown without a ticket", () => {
    expect(
      deriveStageCtaKind({
        mode: "countdown",
        offerEntry: true,
        hasTicket: false,
        canEnter: true,
        canVerify: false,
        canClaim: false,
        canSettle: false,
        canRefund: false,
        canExpire: false,
        canRetry: false,
      })
    ).toBe("enter");
  });

  it("offers verify while awaiting settle", () => {
    expect(
      deriveStageCtaKind({
        mode: "awaiting-settle",
        offerEntry: false,
        hasTicket: true,
        canEnter: false,
        canVerify: true,
        canClaim: false,
        canSettle: false,
        canRefund: false,
        canExpire: false,
        canRetry: false,
      })
    ).toBe("verify");
  });

  it("prefers claim over settle when both could apply", () => {
    expect(
      deriveStageCtaKind({
        mode: "awaiting-settle",
        offerEntry: false,
        hasTicket: true,
        canEnter: false,
        canVerify: false,
        canClaim: true,
        canSettle: true,
        canRefund: false,
        canExpire: false,
        canRetry: false,
      })
    ).toBe("claim");
  });

  it("offers refund when expired and refundable", () => {
    expect(
      deriveStageCtaKind({
        mode: "expired",
        offerEntry: false,
        hasTicket: true,
        canEnter: false,
        canVerify: false,
        canClaim: false,
        canSettle: false,
        canRefund: true,
        canExpire: false,
        canRetry: false,
      })
    ).toBe("refund");
  });

  it("offers retry when settlement actions fail while awaiting settle", () => {
    expect(
      deriveStageCtaKind({
        mode: "awaiting-settle",
        offerEntry: false,
        hasTicket: true,
        canEnter: false,
        canVerify: false,
        canClaim: false,
        canSettle: false,
        canRefund: false,
        canExpire: false,
        canRetry: true,
      })
    ).toBe("retry");
  });

  it("returns none when there is no actionable CTA", () => {
    expect(
      deriveStageCtaKind({
        mode: "replay",
        offerEntry: false,
        hasTicket: false,
        canEnter: false,
        canVerify: false,
        canClaim: false,
        canSettle: false,
        canRefund: false,
        canExpire: false,
        canRetry: false,
      })
    ).toBe("none");
  });
});
