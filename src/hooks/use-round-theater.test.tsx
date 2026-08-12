// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentCrashRoundView } from "@/hooks/use-current-crash-round";

const sdk = vi.hoisted(() => {
  const makeTimeline = (
    phase: "open" | "finalized" | "locked",
    roundId: bigint
  ) => ({
    roundId,
    phase,
    segments: [
      { id: "entry" as const, state: "active" as const, progress: 0.2 },
      { id: "locked" as const, state: "upcoming" as const, progress: null },
      { id: "reveal" as const, state: "upcoming" as const, progress: null },
      { id: "result" as const, state: "upcoming" as const, progress: null },
      { id: "next" as const, state: "upcoming" as const, progress: null },
    ],
    countdown: { kind: "entry-closes" as const, seconds: 30 },
    nextRoundOpensInSeconds: 45,
    expiresInSeconds: null,
  });

  const makeReady = (
    overrides: Partial<Extract<CurrentCrashRoundView, { status: "ready" }>>
  ): CurrentCrashRoundView => ({
    status: "ready",
    roundId: 12n,
    phase: "finalized",
    countdownSeconds: 0,
    crashRandom: null,
    crashPointBps: 25_000n,
    displayCrashPoint: "2.50x",
    finalizedAtSeconds: 1_000n,
    chainTimestamp: 1_005n,
    timeline: makeTimeline("finalized", 12n),
    openingTransactionUrl: null,
    revealTransactionUrl: null,
    finalizeTransactionUrl: null,
    expireTransactionUrl: null,
    gameContractUrl: "https://example.com/game",
    incoContractUrl: "https://example.com/inco",
    blockNumber: 1n,
    retry: vi.fn(),
    ...overrides,
  });

  return {
    makeTimeline,
    makeReady,
    round: makeReady({}) as CurrentCrashRoundView,
    poll: {
      config: null,
      data: null,
      status: "ready" as const,
      refresh: vi.fn(async () => {}),
    },
  };
});

vi.mock("@/hooks/use-current-crash-round", () => ({
  useCurrentCrashRound: () => sdk.round,
}));

vi.mock("@/hooks/use-polled-crash-read", () => ({
  usePolledCrashRead: () => sdk.poll,
}));

vi.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => false,
}));

import { useRoundTheater } from "./use-round-theater";

// crashPointBps 2.50x → ~8s replay + 4s beat: hold ends 12s past finalize.
describe("useRoundTheater display-round hold", () => {
  beforeEach(() => {
    sdk.round = sdk.makeReady({});
  });

  it("keeps the finished round on the hero into the next entry window", () => {
    const { result, rerender } = renderHook(() => useRoundTheater());
    expect(result.current.live.kind).toBe("finalized");
    expect(result.current.hero.type).toBe("replay");

    // Epoch flips: round 13 is now open, 6s after round 12 finalized.
    sdk.round = sdk.makeReady({
      roundId: 13n,
      phase: "open",
      countdownSeconds: 30,
      crashPointBps: null,
      displayCrashPoint: null,
      finalizedAtSeconds: null,
      chainTimestamp: 1_006n,
      timeline: sdk.makeTimeline("open", 13n),
    });
    rerender();

    const held = result.current;
    expect(held.live.kind).toBe("open");
    if (held.live.kind !== "open") throw new Error("unreachable");
    expect(held.live.roundId).toBe(13n);
    expect(held.live.timeline.roundId).toBe(13n);
    expect(held.hero.type).toBe("replay");
    if (held.hero.type !== "replay") throw new Error("unreachable");
    expect(held.hero.roundId).toBe(12n);
    expect(held.hero.displayCrashPoint).toBe("2.50x");

    // Past the replay + beat, the hold releases to the live open round.
    sdk.round = sdk.makeReady({
      roundId: 13n,
      phase: "open",
      countdownSeconds: 24,
      crashPointBps: null,
      displayCrashPoint: null,
      finalizedAtSeconds: null,
      chainTimestamp: 1_012n,
      timeline: sdk.makeTimeline("open", 13n),
    });
    rerender();
    expect(result.current.live.kind).toBe("open");
    expect(result.current.hero.type).not.toBe("replay");
  });

  it("never holds across more than one epoch", () => {
    const { result, rerender } = renderHook(() => useRoundTheater());
    expect(result.current.live.kind).toBe("finalized");

    sdk.round = sdk.makeReady({
      roundId: 14n,
      phase: "open",
      crashPointBps: null,
      displayCrashPoint: null,
      finalizedAtSeconds: null,
      chainTimestamp: 1_006n,
      timeline: sdk.makeTimeline("open", 14n),
    });
    rerender();
    expect(result.current.live.kind).toBe("open");
    expect(result.current.hero.type).not.toBe("replay");
  });

  it("skips the hold when the next round is already locked", () => {
    const { result, rerender } = renderHook(() => useRoundTheater());
    expect(result.current.live.kind).toBe("finalized");

    sdk.round = sdk.makeReady({
      roundId: 13n,
      phase: "locked",
      crashPointBps: null,
      displayCrashPoint: null,
      finalizedAtSeconds: null,
      chainTimestamp: 1_006n,
      timeline: sdk.makeTimeline("locked", 13n),
    });
    rerender();
    expect(result.current.live.kind).toBe("delayed");
    expect(result.current.hero.type).toBe("pending");
  });

  it("keeps live finalized as this round's replay, not a held previous", () => {
    const { result } = renderHook(() => useRoundTheater());
    const view = result.current;
    expect(view.live.kind).toBe("finalized");
    if (view.live.kind !== "finalized") throw new Error("unreachable");
    expect(view.live.roundId).toBe(12n);
    expect(view.live.timeline.countdown).toEqual({
      kind: "entry-closes",
      seconds: 30,
    });
    expect(view.hero.type).toBe("replay");
    if (view.hero.type !== "replay") throw new Error("unreachable");
    expect(view.hero.roundId).toBe(12n);
  });
});
