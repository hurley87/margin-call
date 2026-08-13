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
  CrashRoundEntry: () => <div data-testid="entry-form">Enter form</div>,
}));

vi.mock("@/components/current-round/crash-ticket-refund", () => ({
  CrashTicketRefund: () => null,
}));

vi.mock("@/components/desk-phone/margin-call-voice-trigger", () => ({
  MarginCallVoiceTrigger: () => null,
}));

import { StageActions } from "./stage-actions";

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
        roundId={12n}
        settlement={sdk.settlement}
      />
    );

    const dock = screen.getByTestId("stage-actions");
    expect(dock.className).not.toMatch(/overflow-y-auto/);
    expect(screen.queryByTestId("entry-form")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Verify and settle" }));
    expect(sdk.settlement.verifyAndSettle).toHaveBeenCalledOnce();
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
        roundId={12n}
        settlement={sdk.settlement}
      />
    );
    expect(container.textContent).toBe("");
  });
});
