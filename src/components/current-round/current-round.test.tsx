// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentCrashRoundView } from "@/hooks/use-current-crash-round";

const sdk = vi.hoisted(() => {
  const makeTimeline = () => ({
    roundId: 12n,
    phase: "open" as const,
    segments: [
      { id: "entry" as const, state: "active" as const, progress: 0.5 },
      { id: "locked" as const, state: "upcoming" as const, progress: null },
      { id: "reveal" as const, state: "upcoming" as const, progress: null },
      { id: "result" as const, state: "upcoming" as const, progress: null },
      { id: "next" as const, state: "upcoming" as const, progress: null },
    ],
    countdown: { kind: "entry-closes" as const, seconds: 18 },
    expiresInSeconds: null,
  });
  const makeReadyRound = () =>
    ({
      status: "ready",
      roundId: 12n,
      phase: "open",
      countdownSeconds: 18,
      timeline: makeTimeline(),
      crashRandom:
        "0x000000000000000000000000000000000000000000000000000000000000cafe",
      crashPointBps: null,
      displayCrashPoint: null,
      finalizedAtSeconds: null,
      chainTimestamp: 1_000n,
      openingTransactionUrl:
        "https://sepolia.basescan.org/tx/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      revealTransactionUrl: null,
      finalizeTransactionUrl: null,
      expireTransactionUrl: null,
      gameContractUrl:
        "https://sepolia.basescan.org/address/0x0000000000000000000000000000000000000001#code",
      incoContractUrl:
        "https://sepolia.basescan.org/address/0x4b9911b0191B0b6a6eA8F2Ed562e20Cff5AC8624#code",
      blockNumber: 45_314_123n,
      retry: vi.fn(),
    }) satisfies CurrentCrashRoundView;
  return { makeReadyRound, round: makeReadyRound() as CurrentCrashRoundView };
});

vi.mock("@/hooks/use-current-crash-round", () => ({
  useCurrentCrashRound: () => sdk.round,
}));

vi.mock("./crash-round-entry", () => ({
  CrashRoundEntry: ({
    phase,
    countdownSeconds,
  }: {
    phase: string;
    countdownSeconds: number;
  }) => (
    <div data-testid="crash-round-entry">
      entry:{phase}:{countdownSeconds}
    </div>
  ),
}));

import { CurrentRound } from "./current-round";

describe("CurrentRound", () => {
  beforeEach(() => {
    sdk.round = sdk.makeReadyRound();
  });

  afterEach(cleanup);

  it("shows authoritative public round data without authentication", () => {
    const ready = sdk.makeReadyRound();
    render(<CurrentRound />);

    expect(screen.getByRole("heading", { name: "Entry open" })).toBeTruthy();
    expect(screen.getAllByText("Entry open").length).toBeGreaterThan(0);
    expect(screen.queryByText("Round 12")).toBeNull();
    // Open phase now explains itself instead of rendering nothing.
    expect(
      screen.getByText(/Commit Margin at an Arcade Leverage/)
    ).toBeTruthy();
    // Entry is still open, so no reopen notice.
    expect(screen.queryByTestId("next-round-notice")).toBeNull();
    // Countdown and Crash Point live on the theater chart, not this rail.
    expect(screen.queryByText("00:18")).toBeNull();
    expect(screen.getByText(ready.crashRandom as string)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Opening tx" }).getAttribute("href")
    ).toBe(ready.openingTransactionUrl);
    expect(
      screen.getByRole("link", { name: "Game contract" }).getAttribute("href")
    ).toBe(ready.gameContractUrl);
    expect(screen.getByTestId("crash-round-entry").textContent).toBe(
      "entry:open:18"
    );
  });

  it("renders finalized status without duplicating the Crash Point", () => {
    const ready = sdk.makeReadyRound();
    sdk.round = {
      ...ready,
      phase: "finalized",
      countdownSeconds: 0,
      displayCrashPoint: "3.42x",
      timeline: {
        ...ready.timeline,
        phase: "finalized",
        countdown: { kind: "next-opens", seconds: 33 },
      },
      revealTransactionUrl:
        "https://sepolia.basescan.org/tx/0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      finalizeTransactionUrl:
        "https://sepolia.basescan.org/tx/0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    };
    render(<CurrentRound />);

    expect(screen.getAllByText("Finalized").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Verified crash point 3.42x")).toBeNull();
    expect(screen.queryByText("Verified Crash Point")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Finalization tx" }).getAttribute("href")
    ).toBe(
      "https://sepolia.basescan.org/tx/0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    );
    expect(
      screen.getByRole("link", { name: "Inco Lightning" }).getAttribute("href")
    ).toBe(ready.incoContractUrl);
  });

  it("renders honest awaiting-attestation and expired states without invented multipliers", () => {
    const ready = sdk.makeReadyRound();
    sdk.round = {
      ...ready,
      phase: "reveal-requested",
      countdownSeconds: 0,
      timeline: {
        ...ready.timeline,
        phase: "reveal-requested",
        countdown: { kind: "next-opens", seconds: 33 },
      },
      revealTransactionUrl:
        "https://sepolia.basescan.org/tx/0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };
    const { rerender } = render(<CurrentRound />);
    expect(screen.getAllByText("Awaiting attestation").length).toBeGreaterThan(
      0
    );
    expect(screen.getByText(/No Crash Point is shown/)).toBeTruthy();
    expect(screen.queryByText("Verified Crash Point")).toBeNull();

    sdk.round = {
      ...ready,
      phase: "locked",
      countdownSeconds: 0,
      timeline: {
        ...ready.timeline,
        phase: "locked",
        countdown: { kind: "next-opens", seconds: 33 },
      },
    };
    rerender(<CurrentRound />);
    expect(screen.getByText("Awaiting reveal request")).toBeTruthy();
    expect(screen.getByTestId("next-round-notice").textContent).toBe(
      "Entries reopen in 00:33"
    );

    sdk.round = {
      ...ready,
      phase: "expired-eligible",
      countdownSeconds: 0,
      timeline: {
        ...ready.timeline,
        phase: "expired-eligible",
        countdown: { kind: "next-opens", seconds: 33 },
      },
    };
    rerender(<CurrentRound />);
    expect(screen.getAllByText("Past expiry").length).toBeGreaterThan(0);
    expect(screen.queryByText("Verified Crash Point")).toBeNull();

    sdk.round = {
      ...ready,
      phase: "expired",
      countdownSeconds: 0,
      timeline: {
        ...ready.timeline,
        phase: "expired",
        countdown: { kind: "next-opens", seconds: 33 },
      },
      expireTransactionUrl:
        "https://sepolia.basescan.org/tx/0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    };
    rerender(<CurrentRound />);
    expect(screen.getByText("Outcome unavailable")).toBeTruthy();
    expect(screen.queryByText("Verified Crash Point")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Expiry tx" }).getAttribute("href")
    ).toBe(
      "https://sepolia.basescan.org/tx/0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    );
  });

  it("renders configuration and retry failures explicitly", () => {
    const retry = vi.fn();
    sdk.round = {
      status: "unavailable",
      error: "Crash round reads are not configured.",
      retry,
    };
    const { rerender } = render(<CurrentRound />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Crash round reads are not configured."
    );

    sdk.round = {
      status: "error",
      error: "The current round could not be refreshed.",
      retry,
    };
    rerender(<CurrentRound />);
    fireEvent.click(screen.getByRole("button", { name: "Retry round read" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
