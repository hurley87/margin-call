// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TheaterStage } from "@/hooks/use-round-theater";

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

  const makeOpen = (): TheaterStage => ({
    kind: "open",
    roundId: 12n,
    countdownSeconds: 22,
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
    ambiance: null,
    reducedMotion: false,
    retry: vi.fn(),
  });

  return {
    emptyTiers,
    makeOpen,
    stage: makeOpen() as TheaterStage,
  };
});

vi.mock("@/hooks/use-round-theater", () => ({
  useRoundTheater: () => sdk.stage,
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
      dispose: vi.fn(),
    }),
  };
});

import { RoundTheater } from "./round-theater";

describe("RoundTheater", () => {
  beforeEach(() => {
    sdk.stage = sdk.makeOpen();
  });

  afterEach(cleanup);

  it("shows the Open stage with contract-derived countdown and ticket tape", () => {
    render(<RoundTheater />);

    expect(screen.getByTestId("round-theater")).toBeTruthy();
    expect(screen.getByTestId("theater-countdown").textContent).toBe("00:22");
    expect(screen.getByText("Live ticket tape")).toBeTruthy();
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
    sdk.stage = {
      kind: "delayed",
      roundId: 12n,
      phaseLabel: "reveal-requested",
      tape: null,
      reducedMotion: false,
      retry: vi.fn(),
    };
    render(<RoundTheater />);

    expect(screen.getByTestId("theater-delayed")).toBeTruthy();
    expect(screen.getByText("Awaiting attestation")).toBeTruthy();
    expect(screen.queryByTestId("theater-finalized-replay")).toBeNull();
    expect(screen.queryByText(/\d+\.\d+x/)).toBeNull();
  });

  it("shows expired without inventing a Crash Point", () => {
    sdk.stage = {
      kind: "expired",
      roundId: 12n,
      tape: null,
      reducedMotion: false,
      retry: vi.fn(),
    };
    render(<RoundTheater />);

    expect(screen.getByTestId("theater-expired")).toBeTruthy();
    expect(screen.getByText("Outcome unavailable")).toBeTruthy();
    expect(screen.queryByText(/\d+\.\d+x/)).toBeNull();
  });

  it("renders the animated replay for finalized rounds with tier closes", () => {
    sdk.stage = {
      kind: "finalized",
      roundId: 12n,
      crashPointBps: 25_000n,
      displayCrashPoint: "2.50x",
      finalizedAtSeconds: 900n,
      chainTimestamp: 910n,
      finalizeTransactionUrl:
        "https://sepolia.basescan.org/tx/0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      tape: null,
      tiers: sdk.emptyTiers(),
      reducedMotion: false,
      retry: vi.fn(),
    };
    render(<RoundTheater />);

    expect(screen.getByTestId("theater-finalized-replay")).toBeTruthy();
    expect(screen.getByText("2.50x")).toBeTruthy();
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

  it("renders the static result card under reduced motion with identical facts", () => {
    sdk.stage = {
      kind: "finalized",
      roundId: 12n,
      crashPointBps: 25_000n,
      displayCrashPoint: "2.50x",
      finalizedAtSeconds: 900n,
      chainTimestamp: 910n,
      finalizeTransactionUrl:
        "https://sepolia.basescan.org/tx/0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      tape: null,
      tiers: sdk.emptyTiers(),
      reducedMotion: true,
      retry: vi.fn(),
    };
    render(<RoundTheater />);

    expect(screen.getByTestId("theater-finalized-static")).toBeTruthy();
    expect(screen.getByTestId("static-crash-point").textContent).toBe("2.50x");
    expect(screen.getByText("Closed 2.00x — paid")).toBeTruthy();
    expect(screen.getByText("Closed 1.25x — paid")).toBeTruthy();
    expect(screen.getByText("3.00x — margin call")).toBeTruthy();
    expect(screen.getByText("Margin call")).toBeTruthy();
    expect(screen.queryByTestId("theater-finalized-replay")).toBeNull();
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
