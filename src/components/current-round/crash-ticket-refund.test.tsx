// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { useCrashTicketRefund } from "@/hooks/use-crash-ticket-refund";

type Refund = ReturnType<typeof useCrashTicketRefund>;

const sdk = vi.hoisted(() => {
  const makeRefund = (overrides: Partial<Refund> = {}): Refund =>
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
    }) as Refund;

  return { makeRefund, refund: makeRefund() as Refund };
});

vi.mock("@/hooks/use-crash-ticket-refund", () => ({
  useCrashTicketRefund: () => sdk.refund,
}));

import { CrashTicketRefund } from "./crash-ticket-refund";

describe("CrashTicketRefund", () => {
  beforeEach(() => {
    sdk.refund = sdk.makeRefund();
  });

  afterEach(cleanup);

  it("shows refund action for an expired ticket", () => {
    render(<CrashTicketRefund />);
    expect(screen.getByText("Round expired — refund your margin")).toBeTruthy();
    expect(screen.getByText("Refundable margin")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refund margin" }));
    expect(sdk.refund.refund).toHaveBeenCalledOnce();
  });

  it("shows expire action when the round is past expiry", () => {
    sdk.refund = sdk.makeRefund({
      outcome: "pending",
      phase: "expired-eligible",
      canRefund: false,
      canExpire: true,
      round: {
        ...sdk.makeRefund().round!,
        status: 1,
      },
    });
    render(<CrashTicketRefund />);
    fireEvent.click(screen.getByRole("button", { name: "Mark round expired" }));
    expect(sdk.refund.expireRound).toHaveBeenCalledOnce();
  });

  it("disables and relabels refund while a refund stage is in flight", () => {
    sdk.refund = sdk.makeRefund({
      status: "refund-pending",
      busy: true,
      canRefund: true,
    });
    render(<CrashTicketRefund />);
    const button = screen.getByRole("button", { name: "Refunding…" });
    expect(button).toHaveProperty("disabled", true);
    fireEvent.click(button);
    expect(sdk.refund.refund).not.toHaveBeenCalled();
  });

  it("hides for non-expiry tickets owned by settlement", () => {
    sdk.refund = sdk.makeRefund({
      outcome: "won",
      phase: "finalized",
      canRefund: false,
      canExpire: false,
    });
    const { container } = render(<CrashTicketRefund />);
    expect(container.textContent).toBe("");
  });

  it("hides when the wallet has no recoverable ticket", () => {
    sdk.refund = sdk.makeRefund({
      ticket: null,
      round: null,
      outcome: null,
      payout: null,
      canRefund: false,
    });
    const { container } = render(<CrashTicketRefund />);
    expect(container.textContent).toBe("");
  });
});
