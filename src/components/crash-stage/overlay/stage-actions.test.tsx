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
      round: null,
      outcome: "pending",
      payout: 10_000_000n,
      phase: "locked",
      displayCrashPoint: null,
      canVerify: true,
      canClaim: false,
      canSettle: false,
      canRetry: false,
      retryAction: null,
      busy: false,
      verifyAndSettle: vi.fn(),
      claim: vi.fn(),
      settleLoss: vi.fn(),
      retry: vi.fn(),
      refresh: vi.fn(),
      ...overrides,
    }) as Settlement;

  return { makeSettlement, settlement: makeSettlement() as Settlement };
});

vi.mock("@/components/auth/auth-gate", () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/current-round/crash-round-entry", () => ({
  CrashRoundEntry: ({ armed }: { armed?: boolean }) => (
    <div data-testid="entry-form">{armed ? "Armed form" : "Enter form"}</div>
  ),
}));

vi.mock("@/components/current-round/crash-ticket-refund", () => ({
  CrashTicketRefund: () => (
    <div data-testid="refund-surface">Refund surface</div>
  ),
}));

vi.mock("@/components/desk-phone/margin-call-voice-trigger", () => ({
  MarginCallVoiceTrigger: () => null,
}));

import { StageActions } from "./stage-actions";

const emptyRefund = {
  status: "ready" as const,
  error: null,
  walletAddress: null,
  ticket: null,
  round: null,
  outcome: null,
  payout: null,
  phase: null,
  canExpire: false,
  canRefund: false,
  canRetry: false,
  retryAction: null,
  busy: false,
  expireRound: vi.fn(),
  refund: vi.fn(),
  retry: vi.fn(),
  refresh: vi.fn(),
};

describe("StageActions", () => {
  beforeEach(() => {
    sdk.settlement = sdk.makeSettlement();
  });

  afterEach(cleanup);

  it("shows Verify and settle in the first viewport without a scroll region", () => {
    render(
      <StageActions
        countdownSeconds={8}
        hasTicket
        mode="awaiting-settle"
        phase="locked"
        refund={emptyRefund}
        roundId={12n}
        settlement={sdk.settlement}
      />
    );

    const dock = screen.getByTestId("stage-actions");
    expect(dock.className).not.toMatch(/overflow-y-auto/);
    expect(dock.className).toMatch(/max-h-full/);
    expect(screen.queryByTestId("entry-form")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Verify and settle" })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Verify and settle" }));
    expect(sdk.settlement.verifyAndSettle).toHaveBeenCalledOnce();
  });

  it("keeps Enter available in the dock during open countdown", () => {
    sdk.settlement = sdk.makeSettlement({
      ticket: null,
      canVerify: false,
      walletAddress: "0x0000000000000000000000000000000000000003",
    });
    render(
      <StageActions
        countdownSeconds={22}
        hasTicket={false}
        mode="countdown"
        phase="open"
        refund={emptyRefund}
        roundId={12n}
        settlement={sdk.settlement}
      />
    );
    expect(screen.getByTestId("stage-actions")).toBeTruthy();
    expect(screen.getByTestId("entry-form")).toBeTruthy();
    expect(screen.getByText("Enter form")).toBeTruthy();
    const card = screen.getByTestId("stage-actions").firstElementChild;
    expect(card?.className).toMatch(/max-h-full/);
    expect(card?.className).not.toMatch(/svh/);
  });

  it("keeps an armed dock mounted between rounds", () => {
    sdk.settlement = sdk.makeSettlement({
      ticket: null,
      canVerify: false,
      canClaim: false,
      canSettle: false,
      canRetry: false,
    });
    render(
      <StageActions
        countdownSeconds={8}
        hasTicket={false}
        mode="countdown"
        phase="locked"
        refund={emptyRefund}
        roundId={12n}
        settlement={sdk.settlement}
      />
    );
    expect(screen.getByTestId("stage-actions")).toBeTruthy();
    expect(screen.getByText("Armed form")).toBeTruthy();
  });

  it("disables and relabels verify while settlement is in flight", () => {
    sdk.settlement = sdk.makeSettlement({
      status: "reveal-submitting",
      busy: true,
      canVerify: true,
      canClaim: false,
    });
    render(
      <StageActions
        countdownSeconds={8}
        hasTicket
        mode="awaiting-settle"
        phase="locked"
        refund={emptyRefund}
        roundId={12n}
        settlement={sdk.settlement}
      />
    );
    const button = screen.getByRole("button", { name: "Verifying…" });
    expect(button).toHaveProperty("disabled", true);
  });

  it("shows the enter form during open countdown without a ticket", () => {
    sdk.settlement = sdk.makeSettlement({
      ticket: null,
      canVerify: false,
      walletAddress: "0x0000000000000000000000000000000000000003",
    });
    render(
      <StageActions
        countdownSeconds={22}
        hasTicket={false}
        mode="countdown"
        phase="open"
        refund={emptyRefund}
        roundId={12n}
        settlement={sdk.settlement}
      />
    );
    expect(screen.getByTestId("entry-form")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Verify and settle" })
    ).toBeNull();
  });

  it("still offers enter during a previous-round outcome while the next round is open", () => {
    sdk.settlement = sdk.makeSettlement({
      ticket: null,
      canVerify: false,
      canClaim: false,
      canSettle: false,
      canRetry: false,
    });
    render(
      <StageActions
        countdownSeconds={22}
        hasTicket={false}
        mode="outcome"
        phase="open"
        refund={emptyRefund}
        roundId={12n}
        settlement={sdk.settlement}
      />
    );
    expect(screen.getByTestId("entry-form")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Verify and settle" })
    ).toBeNull();
  });

  it("hides the dock when the outcome graph owns the pit", () => {
    sdk.settlement = sdk.makeSettlement({
      canVerify: false,
      ticket: {
        id: 7n,
        player: "0x0000000000000000000000000000000000000003",
        roundId: 12n,
        margin: 5_000_000n,
        leverageBps: 20_000n,
        reservedPayout: 10_000_000n,
        settled: true,
        claimed: true,
      },
    });
    const { container } = render(
      <StageActions
        countdownSeconds={12}
        hasTicket
        mode="outcome"
        phase="finalized"
        refund={emptyRefund}
        roundId={12n}
        settlement={sdk.settlement}
      />
    );
    expect(container.textContent).toBe("");
  });

  it("shows refund during Open when a leftover expiry ticket blocks entry", () => {
    sdk.settlement = sdk.makeSettlement({
      canVerify: false,
      canClaim: false,
      canSettle: false,
      canRetry: false,
      phase: "expired",
      outcome: "refundable",
    });
    render(
      <StageActions
        countdownSeconds={22}
        hasTicket
        mode="countdown"
        phase="open"
        refund={emptyRefund}
        roundId={13n}
        settlement={sdk.settlement}
      />
    );

    expect(screen.getByTestId("refund-surface")).toBeTruthy();
    expect(screen.queryByTestId("entry-form")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Verify and settle" })
    ).toBeNull();
  });
});
