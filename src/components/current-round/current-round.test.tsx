// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentCrashRoundView } from "@/hooks/use-current-crash-round";

const sdk = vi.hoisted(() => {
  const makeReadyRound = () =>
    ({
      status: "ready",
      roundId: 12n,
      phase: "open",
      countdownSeconds: 18,
      crashRandom:
        "0x000000000000000000000000000000000000000000000000000000000000cafe",
      openingTransactionUrl:
        "https://sepolia.basescan.org/tx/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      blockNumber: 45_314_123n,
      retry: vi.fn(),
    }) satisfies CurrentCrashRoundView;
  return { makeReadyRound, round: makeReadyRound() as CurrentCrashRoundView };
});

vi.mock("@/hooks/use-current-crash-round", () => ({
  useCurrentCrashRound: () => sdk.round,
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

    expect(screen.getByText("Round 12")).toBeTruthy();
    expect(screen.getByText("Entry open")).toBeTruthy();
    expect(screen.getByText("00:18")).toBeTruthy();
    expect(screen.getByText(ready.crashRandom)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "View opening transaction" })
        .getAttribute("href")
    ).toBe(ready.openingTransactionUrl);
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
