// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryTicketActionStatus } from "@/hooks/use-history-ticket-actions";
import type { PlayerTicketHistoryItem } from "@/lib/margin-call-crash";

const sdk = vi.hoisted(() => {
  const PLAYER = "0x00000000000000000000000000000000000000aa" as const;
  const claimable: PlayerTicketHistoryItem = {
    ticket: {
      id: 30n,
      player: PLAYER,
      roundId: 3n,
      margin: 5_000_000n,
      leverageBps: 20_000n,
      reservedPayout: 10_000_000n,
      settled: false,
      claimed: false,
    },
    round: {
      id: 3n,
      openAt: 1_000n,
      lockAt: 1_045n,
      expiresAt: 1_945n,
      crashRandom:
        "0x000000000000000000000000000000000000000000000000000000000000cafe",
      crashPointBps: 34_200n,
      totalMargin: 5_000_000n,
      reservedPayout: 10_000_000n,
      status: 3,
    },
    phase: "finalized",
    outcome: "won",
    displayCrashPoint: "3.42x",
    payout: 10_000_000n,
    amountKind: "payout",
    displayAmount: 10_000_000n,
    canClaim: true,
    canSettle: false,
    canVerify: false,
    canExpire: false,
    canRefund: false,
    settlementTransaction: null,
  };
  const refundable: PlayerTicketHistoryItem = {
    ticket: {
      id: 40n,
      player: PLAYER,
      roundId: 4n,
      margin: 1_000_000n,
      leverageBps: 12_500n,
      reservedPayout: 1_250_000n,
      settled: false,
      claimed: false,
    },
    round: {
      id: 4n,
      openAt: 2_000n,
      lockAt: 2_045n,
      expiresAt: 2_945n,
      crashRandom:
        "0x000000000000000000000000000000000000000000000000000000000000beef",
      crashPointBps: 0n,
      totalMargin: 1_000_000n,
      reservedPayout: 1_250_000n,
      status: 4,
    },
    phase: "expired",
    outcome: "refundable",
    displayCrashPoint: null,
    payout: null,
    amountKind: "refund",
    displayAmount: 1_000_000n,
    canClaim: false,
    canSettle: false,
    canVerify: false,
    canExpire: false,
    canRefund: true,
    settlementTransaction: null,
  };
  const settled: PlayerTicketHistoryItem = {
    ticket: {
      id: 10n,
      player: PLAYER,
      roundId: 1n,
      margin: 1_000_000n,
      leverageBps: 12_500n,
      reservedPayout: 1_250_000n,
      settled: true,
      claimed: true,
    },
    round: {
      id: 1n,
      openAt: 100n,
      lockAt: 145n,
      expiresAt: 1_045n,
      crashRandom:
        "0x000000000000000000000000000000000000000000000000000000000000dead",
      crashPointBps: 12_500n,
      totalMargin: 1_000_000n,
      reservedPayout: 1_250_000n,
      status: 3,
    },
    phase: "finalized",
    outcome: "settled-win",
    displayCrashPoint: "1.25x",
    payout: 1_250_000n,
    amountKind: "payout",
    displayAmount: 1_250_000n,
    canClaim: false,
    canSettle: false,
    canVerify: false,
    canExpire: false,
    canRefund: false,
    settlementTransaction: {
      kind: "claim" as const,
      url: "https://sepolia.basescan.org/tx/0xeee5",
    },
  };

  return {
    history: {
      status: "ready" as const,
      walletAddress: PLAYER,
      tickets: [refundable, claimable, settled],
      retry: vi.fn(),
    },
    actions: {
      status: "idle" as HistoryTicketActionStatus,
      error: null as string | null,
      activeTicketId: null as bigint | null,
      busy: false,
      claim: vi.fn(),
      settleLoss: vi.fn(),
      expireRound: vi.fn(),
      refund: vi.fn(),
      verifyAndSettle: vi.fn(),
      retry: vi.fn(),
    },
  };
});

vi.mock("@/hooks/use-personal-history", () => ({
  usePersonalHistory: () => sdk.history,
}));

vi.mock("@/hooks/use-history-ticket-actions", () => ({
  useHistoryTicketActions: () => sdk.actions,
}));

import { PersonalHistory } from "./personal-history";

describe("PersonalHistory", () => {
  beforeEach(() => {
    sdk.actions.status = "idle";
    sdk.actions.error = null;
    sdk.actions.activeTicketId = null;
    sdk.actions.busy = false;
    sdk.actions.claim.mockReset();
    sdk.actions.refund.mockReset();
  });

  afterEach(cleanup);

  it("lists every ticket with claim and refund actions when unsettled", () => {
    render(<PersonalHistory />);

    expect(screen.queryByText("Record")).toBeNull();
    expect(screen.getByText("Won — claim your payout")).toBeTruthy();
    expect(screen.getByText("Round expired — refund your margin")).toBeTruthy();
    expect(screen.getByText("Payout claimed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Claim payout" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refund margin" })).toBeTruthy();
  });

  it("invokes receipt-backed claim without treating a hash as settlement", () => {
    render(<PersonalHistory />);
    fireEvent.click(screen.getByRole("button", { name: "Claim payout" }));
    expect(sdk.actions.claim).toHaveBeenCalledWith(
      expect.objectContaining({ id: 30n })
    );
    expect(screen.queryByText("Payout claimed")).toBeTruthy();
    // The settled row remains the only claimed label; pending claim does not
    // flip the unsettled ticket's displayed settlement state.
    expect(screen.getByText("Won — claim your payout")).toBeTruthy();
  });

  it("links a settled ticket to its settlement transaction on BaseScan", () => {
    render(<PersonalHistory />);
    const link = screen.getByRole("link", {
      name: "View claim transaction on BaseScan",
    });
    expect(link.getAttribute("href")).toBe(
      "https://sepolia.basescan.org/tx/0xeee5"
    );
    // Unsettled rows have no settlement to link yet.
    expect(screen.queryAllByRole("link", { name: /BaseScan/ })).toHaveLength(1);
  });

  it("shows pending claim copy without marking the ticket claimed", () => {
    sdk.actions.activeTicketId = 30n;
    sdk.actions.status = "claim-pending";
    sdk.actions.busy = true;
    render(<PersonalHistory />);

    expect(
      screen.getByText(/Claim pending until its Base Sepolia receipt succeeds/)
    ).toBeTruthy();
    expect(screen.getByText("Won — claim your payout")).toBeTruthy();
    const claim = screen.getByRole("button", { name: "Claiming…" });
    expect(claim).toHaveProperty("disabled", true);
  });
});
