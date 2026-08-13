// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { useCrashTicketRefund } from "@/hooks/use-crash-ticket-refund";
import { CrashTicketRefund } from "./crash-ticket-refund";

type Refund = ReturnType<typeof useCrashTicketRefund>;

function makeRefund(overrides: Partial<Refund> = {}): Refund {
  return {
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
      crashPointBps: 0n,
      totalMargin: 5_000_000n,
      reservedPayout: 10_000_000n,
      status: 4,
    },
    outcome: "refundable",
    payout: 5_000_000n,
    phase: "expired",
    canExpire: false,
    canRefund: true,
    canRetry: false,
    retryAction: null,
    busy: false,
    expireRound: vi.fn(),
    refund: vi.fn(),
    retry: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  } as Refund;
}

describe("CrashTicketRefund", () => {
  let refund: Refund;

  beforeEach(() => {
    refund = makeRefund();
  });

  afterEach(cleanup);

  it("shows refund action for an expired ticket", () => {
    render(<CrashTicketRefund refund={refund} />);
    expect(screen.getByText("Round expired — refund your margin")).toBeTruthy();
    expect(screen.getByText("Refundable margin")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refund margin" }));
    expect(refund.refund).toHaveBeenCalledOnce();
  });

  it("shows expire action when the round is past expiry", () => {
    refund = makeRefund({
      outcome: "pending",
      phase: "expired-eligible",
      canRefund: false,
      canExpire: true,
      round: {
        ...makeRefund().round!,
        status: 1,
      },
    });
    render(<CrashTicketRefund refund={refund} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark round expired" }));
    expect(refund.expireRound).toHaveBeenCalledOnce();
  });

  it("disables and relabels refund while a refund stage is in flight", () => {
    refund = makeRefund({
      status: "refund-pending",
      busy: true,
      canRefund: true,
    });
    render(<CrashTicketRefund refund={refund} />);
    const button = screen.getByRole("button", { name: "Refunding…" });
    expect(button).toHaveProperty("disabled", true);
    fireEvent.click(button);
    expect(refund.refund).not.toHaveBeenCalled();
  });

  it("hides for non-expiry tickets owned by settlement", () => {
    refund = makeRefund({
      outcome: "won",
      phase: "finalized",
      canRefund: false,
      canExpire: false,
    });
    const { container } = render(<CrashTicketRefund refund={refund} />);
    expect(container.textContent).toBe("");
  });

  it("hides when the wallet has no recoverable ticket", () => {
    refund = makeRefund({
      ticket: null,
      round: null,
      outcome: null,
      payout: null,
      canRefund: false,
    });
    const { container } = render(<CrashTicketRefund refund={refund} />);
    expect(container.textContent).toBe("");
  });
});
