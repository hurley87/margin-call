// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TheaterView } from "@/hooks/use-round-theater";

const sdk = vi.hoisted(() => {
  const emptyTiers = () =>
    ([12_500n, 15_000n, 20_000n, 30_000n, 50_000n, 100_000n] as const).map(
      (leverageBps) => ({
        leverageBps,
        ticketCount: leverageBps === 20_000n ? 1 : 0,
        totalMargin: leverageBps === 20_000n ? 5_000_000n : 0n,
        reservedPayout: leverageBps === 20_000n ? 10_000_000n : 0n,
      })
    );

  const makeTimeline = (
    phase:
      "open" | "locked" | "reveal-requested" | "finalized" | "expired" = "open",
    countdown: {
      kind: "entry-closes" | "next-opens";
      seconds: number;
    } = { kind: "entry-closes", seconds: 22 },
    roundId = 12n
  ) => ({
    roundId,
    phase,
    segments: [
      { id: "entry" as const, state: "active" as const, progress: 0.5 },
      { id: "locked" as const, state: "upcoming" as const, progress: null },
      { id: "reveal" as const, state: "upcoming" as const, progress: null },
      { id: "result" as const, state: "upcoming" as const, progress: null },
      { id: "next" as const, state: "upcoming" as const, progress: null },
    ],
    countdown,
    expiresInSeconds: null,
  });

  const makeOpen = (): TheaterView => ({
    live: {
      kind: "open",
      roundId: 12n,
      timeline: makeTimeline(),
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
        tiers: emptyTiers(),
      },
    },
    hero: {
      type: "ambiance",
      roundId: 11n,
      crashPointBps: 25_000n,
      displayCrashPoint: "2.50x",
    },
    reducedMotion: false,
    retry: vi.fn(),
  });

  const FINALIZE_URL =
    "https://sepolia.basescan.org/tx/0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

  const makeFinalized = ({
    reducedMotion = false,
    finalizeUrl = FINALIZE_URL as string | null,
  }: {
    reducedMotion?: boolean;
    finalizeUrl?: string | null;
  } = {}): TheaterView => ({
    live: {
      kind: "finalized",
      roundId: 12n,
      crashPointBps: 25_000n,
      displayCrashPoint: "2.50x",
      finalizedAtSeconds: 900n,
      chainTimestamp: 910n,
      finalizeTransactionUrl: finalizeUrl,
      tape: null,
      tiers: emptyTiers(),
      timeline: makeTimeline("finalized", {
        kind: "next-opens",
        seconds: 5,
      }),
    },
    hero: {
      type: "replay",
      roundId: 12n,
      crashPointBps: 25_000n,
      displayCrashPoint: "2.50x",
      finalizedAtSeconds: 900n,
      chainTimestamp: 910n,
      finalizeTransactionUrl: finalizeUrl,
      tape: null,
      tiers: emptyTiers(),
    },
    reducedMotion,
    retry: vi.fn(),
  });

  const makeTicket = (leverageBps: bigint) => ({
    id: 7n,
    player: "0x00000000000000000000000000000000000000aa",
    roundId: 12n,
    margin: 5_000_000n,
    leverageBps,
    reservedPayout: (5_000_000n * leverageBps) / 10_000n,
    settled: false,
    claimed: false,
  });

  return {
    emptyTiers,
    makeTimeline,
    makeOpen,
    makeFinalized,
    makeTicket,
    FINALIZE_URL,
    view: makeOpen() as TheaterView,
    ticketRoundId: null as bigint | null,
    playerTicket: null as ReturnType<typeof makeTicket> | null,
  };
});

vi.mock("@/hooks/use-round-theater", () => ({
  useRoundTheater: () => sdk.view,
}));

vi.mock("@/hooks/use-theater-player-ticket", () => ({
  useTheaterPlayerTicket: (roundId: bigint | null) => {
    sdk.ticketRoundId = roundId;
    return { ticket: sdk.playerTicket };
  },
}));

vi.mock("@/hooks/use-replay-clock", () => ({
  useReplayClock: () => ({
    progress: 1,
    isComplete: true,
  }),
}));

vi.mock("@/lib/theater-audio", () => {
  let enabled = false;
  const listeners = new Set<() => void>();
  return {
    readTheaterSoundEnabled: () => enabled,
    subscribeTheaterSound: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getTheaterAudio: () => ({
      get enabled() {
        return enabled;
      },
      setEnabled: (next: boolean) => {
        enabled = next;
        for (const listener of listeners) listener();
      },
      playTierClose: vi.fn(),
      playCrashBell: vi.fn(),
      playPhoneRing: vi.fn(),
      playEntryConfirm: vi.fn(),
      playLockThunk: vi.fn(),
      playWinRegister: vi.fn(),
      playCountdownTick: vi.fn(),
      dispose: vi.fn(),
    }),
  };
});

import { RoundTheater } from "./round-theater";

describe("RoundTheater", () => {
  beforeEach(() => {
    sdk.view = sdk.makeOpen();
    sdk.playerTicket = null;
    sdk.ticketRoundId = null;
    window.localStorage.clear();
  });

  afterEach(cleanup);

  it("marks the signed-in player's ticket on the open stage", () => {
    sdk.playerTicket = {
      id: 7n,
      player: "0x00000000000000000000000000000000000000aa",
      roundId: 12n,
      margin: 5_000_000n,
      leverageBps: 20_000n,
      reservedPayout: 10_000_000n,
      settled: false,
      claimed: false,
    };
    render(<RoundTheater />);

    expect(sdk.ticketRoundId).toBe(12n);
    expect(screen.getByTestId("theater-player-ticket").textContent).toContain(
      "Your Ticket · 5 tUSD · 2.00x"
    );
  });

  it("shows the Open stage with hero previous-round chart, countdown, and ticket tape", () => {
    render(<RoundTheater />);

    expect(screen.getByTestId("round-theater")).toBeTruthy();
    expect(screen.getByTestId("theater-countdown").textContent).toBe("00:22");
    expect(screen.getByText("Live ticket tape")).toBeTruthy();
    expect(screen.getByTestId("replay-curve-ambiance")).toBeTruthy();
    expect(screen.getByText("Round 11 replay")).toBeTruthy();
    expect(screen.getByTestId("round-timeline")).toBeTruthy();
    expect(screen.getByTestId("round-timeline-countdown").textContent).toBe(
      "Entry closes in 00:22"
    );
    expect(screen.getByTestId("round-explainer")).toBeTruthy();
    expect(
      screen.getAllByText((_, el) => el?.textContent === "1 tUSD").length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("1.25x").length).toBeGreaterThan(0);
    // Theater never offers entry or settlement actions.
    expect(screen.queryByRole("button", { name: /enter/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /claim/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /settle/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
  });

  it("shows awaiting-attestation with no climb and no invented multiplier", () => {
    sdk.view = {
      live: {
        kind: "delayed",
        roundId: 12n,
        phaseLabel: "reveal-requested",
        tape: null,
        timeline: sdk.makeTimeline("reveal-requested", {
          kind: "next-opens",
          seconds: 9,
        }),
      },
      hero: {
        type: "pending",
        title: "Awaiting attestation",
        body: "Reveal has been requested. No Crash Point is shown until covalidator signatures finalize the exact stored handle.",
      },
      reducedMotion: false,
      retry: vi.fn(),
    };
    render(<RoundTheater />);

    expect(screen.getByTestId("theater-delayed")).toBeTruthy();
    // Appears in both the timeline strip badge and the delayed panel title.
    expect(screen.getAllByText("Awaiting attestation").length).toBeGreaterThan(
      0
    );
    expect(screen.queryByTestId("theater-finalized-replay")).toBeNull();
    expect(screen.queryByText(/\d+\.\d+x/)).toBeNull();
  });

  it("shows expired without inventing a Crash Point", () => {
    sdk.view = {
      live: {
        kind: "expired",
        roundId: 12n,
        tape: null,
        timeline: sdk.makeTimeline("expired", {
          kind: "next-opens",
          seconds: 0,
        }),
      },
      hero: {
        type: "pending",
        title: "Outcome unavailable",
        body: "This round expired without a verified Crash Point. Ticket owners can pull back exactly their original margin.",
      },
      reducedMotion: false,
      retry: vi.fn(),
    };
    render(<RoundTheater />);

    expect(screen.getByTestId("theater-expired")).toBeTruthy();
    expect(screen.getByText("Outcome unavailable")).toBeTruthy();
    expect(screen.queryByText(/\d+\.\d+x/)).toBeNull();
  });

  it("renders the animated replay for finalized rounds with tier closes", () => {
    sdk.view = sdk.makeFinalized();
    render(<RoundTheater />);

    expect(screen.getByTestId("theater-finalized-replay")).toBeTruthy();
    expect(screen.getByTestId("theater-next-round").textContent).toBe(
      "Next round 13 opens in 00:05"
    );
    // Spectator freeze: Crash Point stays the hero; no personal outcome stamp.
    expect(screen.getByTestId("replay-curve-crash-point").textContent).toBe(
      "2.50x"
    );
    expect(screen.queryByTestId("replay-curve-outcome")).toBeNull();
    expect(screen.getByText("Margin call")).toBeTruthy();
    expect(screen.getByText("Closed 2.00x — paid")).toBeTruthy();
    expect(screen.getByText("Closed 1.25x — paid")).toBeTruthy();
    expect(screen.getByText("3.00x — margin call")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Replay" })).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "View finalization transaction" })
        .getAttribute("href")
    ).toContain("0xcccccccccccccccc");
    expect(screen.queryByRole("button", { name: /claim/i })).toBeNull();
  });

  it("freezes the climb on Won when the signed-in player's tier closed", () => {
    sdk.view = sdk.makeFinalized({ finalizeUrl: null });
    sdk.playerTicket = sdk.makeTicket(20_000n); // 2.00x ≤ 2.50x → won
    render(<RoundTheater />);

    expect(screen.getByTestId("replay-curve-outcome").textContent).toBe("Won");
    expect(
      screen.getByTestId("replay-curve-crash-point-supporting").textContent
    ).toBe("Crash Point 2.50x");
    expect(screen.queryByTestId("replay-curve-crash-point")).toBeNull();
    expect(screen.queryByText("Margin call")).toBeNull();
    expect(screen.getByRole("button", { name: "Replay" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /claim/i })).toBeNull();
  });

  it("freezes the climb on Margin called when the signed-in player's tier stayed open", () => {
    sdk.view = sdk.makeFinalized({ finalizeUrl: null });
    sdk.playerTicket = sdk.makeTicket(50_000n); // 5.00x > 2.50x → margin called
    render(<RoundTheater />);

    expect(screen.getByTestId("replay-curve-outcome").textContent).toBe(
      "Margin called"
    );
    expect(
      screen.getByTestId("replay-curve-crash-point-supporting").textContent
    ).toBe("Crash Point 2.50x");
    expect(screen.getByText("Margin call")).toBeTruthy();
    // Personal why once under the hero; stamp keeps market-die copy.
    expect(
      screen.getAllByText("The Crash Point died below your Arcade Leverage.")
        .length
    ).toBe(1);
    expect(
      screen.getByText(
        "Hard stop — every Ticket still open takes the margin call."
      )
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /settle/i })).toBeNull();
  });

  it("renders a held previous replay while live stays the open round", () => {
    sdk.view = {
      live: {
        kind: "open",
        roundId: 13n,
        tape: null,
        timeline: sdk.makeTimeline(
          "open",
          { kind: "entry-closes", seconds: 30 },
          13n
        ),
      },
      hero: {
        type: "replay",
        roundId: 12n,
        crashPointBps: 25_000n,
        displayCrashPoint: "2.50x",
        finalizedAtSeconds: 1_000n,
        chainTimestamp: 1_006n,
        finalizeTransactionUrl: null,
        tape: null,
        tiers: sdk.emptyTiers(),
      },
      reducedMotion: false,
      retry: vi.fn(),
    };
    render(<RoundTheater />);

    expect(sdk.ticketRoundId).toBe(12n);
    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.getByTestId("theater-finalized-replay")).toBeTruthy();
    expect(screen.getByText("Round 12 result")).toBeTruthy();
    expect(screen.getByTestId("theater-next-round").textContent).toBe(
      "Round 13 entry is open — closes in 00:30"
    );
    expect(screen.getByTestId("round-timeline-countdown").textContent).toBe(
      "Entry closes in 00:30"
    );
  });

  it("renders the static result card under reduced motion with identical facts", () => {
    sdk.view = sdk.makeFinalized({ reducedMotion: true });
    render(<RoundTheater />);

    expect(screen.getByTestId("theater-finalized-static")).toBeTruthy();
    expect(screen.getByTestId("static-crash-point").textContent).toBe("2.50x");
    expect(screen.getByText("Closed 2.00x — paid")).toBeTruthy();
    expect(screen.getByText("Closed 1.25x — paid")).toBeTruthy();
    expect(screen.getByText("3.00x — margin call")).toBeTruthy();
    expect(screen.getByText("Margin call")).toBeTruthy();
    expect(screen.queryByTestId("theater-finalized-replay")).toBeNull();
  });

  it("shows Won on the reduced-motion card when the signed-in player won", () => {
    sdk.view = sdk.makeFinalized({ reducedMotion: true, finalizeUrl: null });
    sdk.playerTicket = sdk.makeTicket(12_500n);
    render(<RoundTheater />);

    expect(screen.getByTestId("static-outcome").textContent).toBe("Won");
    expect(
      screen.getByTestId("static-crash-point-supporting").textContent
    ).toBe("Crash Point 2.50x");
    expect(screen.queryByTestId("static-crash-point")).toBeNull();
    expect(screen.queryByText("Margin call")).toBeNull();
  });

  it("shows Margin called on the reduced-motion card when the signed-in player lost", () => {
    sdk.view = sdk.makeFinalized({ reducedMotion: true, finalizeUrl: null });
    sdk.playerTicket = sdk.makeTicket(50_000n);
    render(<RoundTheater />);

    expect(screen.getByTestId("static-outcome").textContent).toBe(
      "Margin called"
    );
    expect(
      screen.getByTestId("static-crash-point-supporting").textContent
    ).toBe("Crash Point 2.50x");
    expect(screen.getByText("Margin call")).toBeTruthy();
    expect(
      screen.getAllByText("The Crash Point died below your Arcade Leverage.")
        .length
    ).toBe(1);
  });

  it("defaults the sound toggle to off and can enable it", () => {
    render(<RoundTheater />);
    const toggle = screen.getByRole("button", { name: "Sound off" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(
      screen
        .getByRole("button", { name: "Sound on" })
        .getAttribute("aria-pressed")
    ).toBe("true");
  });
});
