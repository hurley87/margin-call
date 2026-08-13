// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { useCrashTicketSettlement } from "@/hooks/use-crash-ticket-settlement";

type Settlement = ReturnType<typeof useCrashTicketSettlement>;

const sdk = vi.hoisted(() => {
  const makeSettlement = (overrides: Partial<Settlement> = {}): Settlement =>
    ({
      status: "ready",
      error: null,
      walletAddress: "0x0000000000000000000000000000000000000003",
      ticket: {
        id: 7n,
        player: "0x0000000000000000000000000000000000000003",
        roundId: 12n,
        margin: 5_000_000n,
        leverageBps: 20_000n,
        reservedPayout: 10_000_000n,
        settled: false,
        claimed: false,
      },
      round: {
        id: 12n,
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
      outcome: "won",
      payout: 10_000_000n,
      phase: "finalized",
      displayCrashPoint: "3.42x",
      canVerify: false,
      canClaim: true,
      canSettle: false,
      canRetry: false,
      retryAction: null,
      verifyAndSettle: vi.fn(),
      claim: vi.fn(),
      settleLoss: vi.fn(),
      retry: vi.fn(),
      refresh: vi.fn(),
      ...overrides,
    }) as Settlement;

  return { makeSettlement, settlement: makeSettlement() as Settlement };
});

vi.mock("@/hooks/use-crash-ticket-settlement", () => ({
  useCrashTicketSettlement: () => sdk.settlement,
}));

const voice = vi.hoisted(() => ({
  trigger: vi.fn().mockReturnValue(null),
}));

vi.mock("@/components/desk-phone/margin-call-voice-trigger", () => ({
  MarginCallVoiceTrigger: (props: {
    ticketId: bigint;
    roundId: bigint;
    walletAddress: `0x${string}`;
  }) => voice.trigger(props),
}));

import { CrashTicketSettlement } from "./crash-ticket-settlement";

describe("CrashTicketSettlement", () => {
  beforeEach(() => {
    sdk.settlement = sdk.makeSettlement();
    voice.trigger.mockClear();
  });

  afterEach(cleanup);

  it("shows claim action for a finalized winning ticket", () => {
    render(<CrashTicketSettlement />);
    expect(screen.getByText("Won — claim your payout")).toBeTruthy();
    expect(screen.getByText("3.42x")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Claim payout" }));
    expect(sdk.settlement.claim).toHaveBeenCalledOnce();
  });

  it("shows verify-and-settle when the round is locked", () => {
    sdk.settlement = sdk.makeSettlement({
      outcome: "pending",
      displayCrashPoint: null,
      phase: "locked",
      canClaim: false,
      canVerify: true,
      round: {
        ...sdk.makeSettlement().round!,
        status: 1,
        crashPointBps: 0n,
      },
    });
    render(<CrashTicketSettlement />);
    fireEvent.click(screen.getByRole("button", { name: "Verify and settle" }));
    expect(sdk.settlement.verifyAndSettle).toHaveBeenCalledOnce();
  });

  it("shows settle loss for a finalized loser", () => {
    sdk.settlement = sdk.makeSettlement({
      outcome: "lost",
      payout: 0n,
      canClaim: false,
      canSettle: true,
    });
    render(<CrashTicketSettlement />);
    fireEvent.click(screen.getByRole("button", { name: "Settle loss" }));
    expect(sdk.settlement.settleLoss).toHaveBeenCalledOnce();
  });

  it("requests desk-phone for a lost ticket before settle", () => {
    sdk.settlement = sdk.makeSettlement({
      outcome: "lost",
      payout: 0n,
      canClaim: false,
      canSettle: true,
    });
    render(<CrashTicketSettlement />);
    expect(voice.trigger).toHaveBeenCalledWith({
      roundId: 12n,
      ticketId: 7n,
      walletAddress: "0x0000000000000000000000000000000000000003",
    });
  });

  it("requests desk-phone for a settled-loss ticket", () => {
    sdk.settlement = sdk.makeSettlement({
      outcome: "settled-loss",
      payout: 0n,
      canClaim: false,
      canSettle: false,
    });
    render(<CrashTicketSettlement />);
    expect(voice.trigger).toHaveBeenCalledWith({
      roundId: 12n,
      ticketId: 7n,
      walletAddress: "0x0000000000000000000000000000000000000003",
    });
  });

  it("does not request desk-phone for a winning ticket", () => {
    render(<CrashTicketSettlement />);
    expect(voice.trigger).not.toHaveBeenCalled();
  });

  it("disables and relabels claim while a claim stage is in flight", () => {
    sdk.settlement = sdk.makeSettlement({
      status: "claim-submitting",
      canClaim: true,
    });
    render(<CrashTicketSettlement />);
    const button = screen.getByRole("button", { name: "Claiming…" });
    expect(button).toHaveProperty("disabled", true);
    fireEvent.click(button);
    expect(sdk.settlement.claim).not.toHaveBeenCalled();
  });

  it("hides when the wallet has no recoverable ticket", () => {
    sdk.settlement = sdk.makeSettlement({
      ticket: null,
      round: null,
      outcome: null,
      payout: null,
      canClaim: false,
    });
    const { container } = render(<CrashTicketSettlement />);
    expect(container.textContent).toBe("");
  });
});
