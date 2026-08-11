// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrashRoundPhase } from "@/lib/margin-call-crash";
import type { useCrashRoundEntry } from "@/hooks/use-crash-round-entry";

type Entry = ReturnType<typeof useCrashRoundEntry>;

const sdk = vi.hoisted(() => {
  const makeEntry = (overrides: Partial<Entry> = {}): Entry =>
    ({
      status: "ready",
      error: null,
      selectedMargin: 1_000_000n,
      selectedLeverageBps: 12_500n,
      tUsdBalance: 100_000_000n,
      allowance: 0n,
      ticket: null,
      walletAddress: "0x0000000000000000000000000000000000000003",
      expectedPayout: 1_250_000n,
      needsApproval: true,
      boundedAllowance: 1_000_000_000n,
      vaultAddress: "0x0000000000000000000000000000000000000002",
      gameAddress: "0x0000000000000000000000000000000000000001",
      entryOffered: true,
      hasTicket: false,
      formattedBalance: "100.000000",
      formattedAllowance: "0.000000",
      formattedMargin: "1.000000",
      formattedExpectedPayout: "1.250000",
      formattedBoundedAllowance: "1000.000000",
      canEnter: true,
      canRetry: false,
      retryAction: null,
      selectMargin: vi.fn(),
      selectLeverage: vi.fn(),
      enter: vi.fn(),
      retry: vi.fn(),
      refresh: vi.fn(),
      ...overrides,
    }) as Entry;

  return {
    makeEntry,
    entry: makeEntry() as Entry,
    props: {
      roundId: 12n,
      phase: "open" as CrashRoundPhase,
      countdownSeconds: 18,
    },
  };
});

vi.mock("@/hooks/use-crash-round-entry", () => ({
  useCrashRoundEntry: () => sdk.entry,
}));

import { CrashRoundEntry } from "./crash-round-entry";

describe("CrashRoundEntry", () => {
  beforeEach(() => {
    sdk.entry = sdk.makeEntry();
    sdk.props = { roundId: 12n, phase: "open", countdownSeconds: 18 };
  });

  afterEach(cleanup);

  it("shows an honest waiting state when the epoch is uninitialized", () => {
    sdk.props.phase = "uninitialized";
    render(<CrashRoundEntry {...sdk.props} />);
    expect(screen.getByText(/Waiting for an ETH-holding opener/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /enter/i })).toBeNull();
  });

  it("shows the five-second cutoff instead of the entry form", () => {
    sdk.props.countdownSeconds = 4;
    sdk.entry = sdk.makeEntry({ entryOffered: false });
    render(<CrashRoundEntry {...sdk.props} />);
    expect(screen.getByText(/Entry cutoff/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Approve & enter/ })
    ).toBeNull();
  });

  it("discloses the bounded spender, cap, and contract addresses", () => {
    render(<CrashRoundEntry {...sdk.props} />);
    expect(screen.getByText(/Spender: Bankroll Vault/)).toBeTruthy();
    expect(
      screen.getByText(/0x0000000000000000000000000000000000000002/)
    ).toBeTruthy();
    expect(
      screen.getByText(/One-time bounded approval: 1000.000000 tUSD/)
    ).toBeTruthy();
    expect(
      screen.getByText(/never requests an unlimited allowance/)
    ).toBeTruthy();
    expect(
      screen.getByText(/0x0000000000000000000000000000000000000001/)
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve & enter" }));
    expect(sdk.entry.enter).toHaveBeenCalledOnce();
  });

  it("renders the confirmed live ticket instead of the form", () => {
    sdk.entry = sdk.makeEntry({
      hasTicket: true,
      ticket: {
        id: 7n,
        player: "0x0000000000000000000000000000000000000003",
        roundId: 12n,
        margin: 5_000_000n,
        leverageBps: 20_000n,
        reservedPayout: 10_000_000n,
        settled: false,
        claimed: false,
        refunded: false,
      },
      canEnter: false,
    });
    render(<CrashRoundEntry {...sdk.props} />);
    expect(screen.getByText("Your live ticket")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("5 tUSD")).toBeTruthy();
    expect(screen.getByText("2.00x")).toBeTruthy();
    expect(screen.getByText("10 tUSD")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /enter/i })).toBeNull();
  });

  it("labels receipt-recovery retries honestly", () => {
    sdk.entry = sdk.makeEntry({
      status: "error",
      error:
        "Your entry was submitted, but we couldn't confirm it yet. Retry to check its status.",
      canEnter: false,
      canRetry: true,
      retryAction: "entry-receipt-check",
      needsApproval: false,
    });
    render(<CrashRoundEntry {...sdk.props} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry entry receipt check" })
    );
    expect(sdk.entry.retry).toHaveBeenCalledOnce();
  });
});
