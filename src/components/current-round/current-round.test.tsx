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
      displayCrashPoint: null,
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
    expect(screen.getByText(ready.crashRandom as string)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "View opening transaction" })
        .getAttribute("href")
    ).toBe(ready.openingTransactionUrl);
    expect(
      screen
        .getByRole("link", { name: "Verified game contract" })
        .getAttribute("href")
    ).toBe(ready.gameContractUrl);
  });

  it("renders finalized Crash Point and attestation verification links", () => {
    const ready = sdk.makeReadyRound();
    sdk.round = {
      ...ready,
      phase: "finalized",
      countdownSeconds: 0,
      displayCrashPoint: "3.42x",
      revealTransactionUrl:
        "https://sepolia.basescan.org/tx/0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      finalizeTransactionUrl:
        "https://sepolia.basescan.org/tx/0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    };
    render(<CurrentRound />);

    expect(screen.getByText("Finalized")).toBeTruthy();
    expect(screen.getByText("Verified Crash Point")).toBeTruthy();
    expect(screen.getByLabelText("Verified crash point 3.42x")).toBeTruthy();
    expect(screen.queryByText("Awaiting attestation")).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "View finalization transaction" })
        .getAttribute("href")
    ).toBe(
      "https://sepolia.basescan.org/tx/0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    );
    expect(
      screen
        .getByRole("link", { name: "Verified Inco Lightning" })
        .getAttribute("href")
    ).toBe(ready.incoContractUrl);
  });

  it("renders honest awaiting-attestation and expired states without invented multipliers", () => {
    const ready = sdk.makeReadyRound();
    sdk.round = {
      ...ready,
      phase: "reveal-requested",
      countdownSeconds: 0,
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
    };
    rerender(<CurrentRound />);
    expect(screen.getByText("Awaiting reveal request")).toBeTruthy();

    sdk.round = {
      ...ready,
      phase: "expired-eligible",
      countdownSeconds: 0,
    };
    rerender(<CurrentRound />);
    expect(screen.getAllByText("Past expiry").length).toBeGreaterThan(0);
    expect(screen.queryByText("Verified Crash Point")).toBeNull();

    sdk.round = {
      ...ready,
      phase: "expired",
      countdownSeconds: 0,
      expireTransactionUrl:
        "https://sepolia.basescan.org/tx/0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    };
    rerender(<CurrentRound />);
    expect(screen.getByText("Outcome unavailable")).toBeTruthy();
    expect(screen.queryByText("Verified Crash Point")).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "View expiry transaction" })
        .getAttribute("href")
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
