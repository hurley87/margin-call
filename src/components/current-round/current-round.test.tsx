// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentCrashRoundView } from "@/hooks/use-current-crash-round";

const sdk = vi.hoisted(() => ({
  round: {
    status: "ready",
    error: null,
    roundId: 12n,
    phase: "open",
    countdownSeconds: 18,
    crashRandom:
      "0x000000000000000000000000000000000000000000000000000000000000cafe",
    openingTransactionUrl:
      "https://sepolia.basescan.org/tx/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    blockNumber: 45_314_123n,
    retry: vi.fn(),
  } as CurrentCrashRoundView,
}));

vi.mock("@/hooks/use-current-crash-round", () => ({
  useCurrentCrashRound: () => sdk.round,
}));

import { CurrentRound } from "./current-round";

describe("CurrentRound", () => {
  beforeEach(() => {
    sdk.round = {
      status: "ready",
      error: null,
      roundId: 12n,
      phase: "open",
      countdownSeconds: 18,
      crashRandom:
        "0x000000000000000000000000000000000000000000000000000000000000cafe",
      openingTransactionUrl:
        "https://sepolia.basescan.org/tx/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      blockNumber: 45_314_123n,
      retry: vi.fn(),
    };
  });

  afterEach(cleanup);

  it("shows authoritative public round data without authentication", () => {
    render(<CurrentRound />);

    expect(screen.getByText("Round 12")).toBeTruthy();
    expect(screen.getByText("Entry open")).toBeTruthy();
    expect(screen.getByText("00:18")).toBeTruthy();
    expect(
      screen.getByText(
        "0x000000000000000000000000000000000000000000000000000000000000cafe"
      )
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "View opening transaction" })
        .getAttribute("href")
    ).toBe(sdk.round.openingTransactionUrl);
  });

  it("renders configuration and retry failures explicitly", () => {
    sdk.round = {
      ...sdk.round,
      status: "unavailable",
      error: "Crash round reads are not configured.",
      roundId: null,
      phase: null,
      countdownSeconds: 0,
      crashRandom: null,
      openingTransactionUrl: null,
      blockNumber: null,
    };
    const { rerender } = render(<CurrentRound />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Crash round reads are not configured."
    );

    sdk.round = {
      ...sdk.round,
      status: "error",
      error: "The current round could not be refreshed.",
    };
    rerender(<CurrentRound />);
    fireEvent.click(screen.getByRole("button", { name: "Retry round read" }));
    expect(sdk.round.retry).toHaveBeenCalledOnce();
  });
});
