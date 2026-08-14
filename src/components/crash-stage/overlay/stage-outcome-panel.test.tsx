// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  SettlementTransaction,
  useCrashTicketSettlement,
} from "@/hooks/use-crash-ticket-settlement";
import type { CeremonyReveal, CeremonySnapshot } from "@/lib/settle-ceremony";

vi.mock("@/components/desk-phone/margin-call-voice-trigger", () => ({
  MarginCallVoiceTrigger: () => (
    <div data-testid="voice-trigger">Call my desk phone</div>
  ),
}));

import { StageOutcomePanel } from "./stage-outcome-panel";

type Settlement = ReturnType<typeof useCrashTicketSettlement>;

const ticket = {
  id: 7n,
  player: "0x0000000000000000000000000000000000000003" as const,
  roundId: 12n,
  margin: 5_000_000n,
  leverageBps: 20_000n,
  reservedPayout: 10_000_000n,
  settled: false,
  claimed: false,
};

const snapshot: CeremonySnapshot = {
  roundId: 12n,
  ticket,
  tape: null,
  tiers: [
    {
      leverageBps: 20_000n,
      ticketCount: 1,
      totalMargin: 5_000_000n,
      reservedPayout: 10_000_000n,
    },
  ],
};

const wonReveal: CeremonyReveal = {
  crashPointBps: 25_000n,
  outcome: "won",
  payout: 10_000_000n,
};

const lostReveal: CeremonyReveal = {
  crashPointBps: 15_000n,
  outcome: "lost",
  payout: 0n,
};

const claimTx: SettlementTransaction = {
  stage: "claim",
  hash: "0xccc3",
  url: "https://sepolia.basescan.org/tx/0xccc3",
  confirmed: true,
};

function makeSettlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    status: "confirmed",
    error: null,
    walletAddress: "0x0000000000000000000000000000000000000003",
    ticket,
    round: null,
    outcome: "settled-win",
    payout: 10_000_000n,
    phase: "finalized",
    displayCrashPoint: "2.50x",
    canVerify: false,
    canClaim: false,
    canSettle: false,
    canRetry: false,
    retryAction: null,
    transactions: [claimTx],
    verifyAndSettle: vi.fn(),
    claim: vi.fn(),
    settleLoss: vi.fn(),
    retry: vi.fn(),
    refresh: vi.fn(),
    refreshIfIdle: vi.fn(),
    ...overrides,
  } as Settlement;
}

function renderPanel(
  overrides: Partial<Parameters<typeof StageOutcomePanel>[0]> = {}
) {
  const props = {
    reveal: wonReveal,
    snapshot,
    settlement: makeSettlement(),
    finalizeTransactionUrl: "https://sepolia.basescan.org/tx/0xfff9",
    settleConfirmed: true,
    reducedMotion: false,
    onRewatch: vi.fn(),
    onContinue: vi.fn(),
    ...overrides,
  };
  render(<StageOutcomePanel {...props} />);
  return props;
}

afterEach(cleanup);

describe("StageOutcomePanel", () => {
  it("shows the paid amount on a win with the crash point", () => {
    renderPanel();
    const headline = screen.getByTestId("outcome-headline");
    expect(headline.textContent).toContain("Won · paid");
    expect(headline.textContent).toContain("USDC");
    expect(screen.getByText(/Crash Point 2\.50x/)).toBeTruthy();
    expect(screen.queryByTestId("voice-trigger")).toBeNull();
  });

  it("shows the lost margin and desk-phone trigger on a margin call", () => {
    renderPanel({ reveal: lostReveal });
    expect(screen.getByTestId("outcome-headline").textContent).toContain(
      "Margin called"
    );
    expect(screen.getByTestId("voice-trigger")).toBeTruthy();
  });

  it("links the finalization and every settlement transaction", () => {
    renderPanel();
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "https://sepolia.basescan.org/tx/0xfff9",
      "https://sepolia.basescan.org/tx/0xccc3",
    ]);
  });

  it("gates Continue behind the settle receipt", () => {
    const props = renderPanel({
      settleConfirmed: false,
      settlement: makeSettlement({
        status: "claim-pending",
        canClaim: false,
      }),
    });
    const button = screen.getByRole("button", { name: "Settling onchain…" });
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.click(button);
    expect(props.onContinue).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("Claim pending");
  });

  it("offers Claim payout when the ticket won but is still unsettled", () => {
    const settlement = makeSettlement({
      status: "ready",
      outcome: "won",
      canClaim: true,
      canSettle: false,
      canRetry: false,
      transactions: [],
    });
    renderPanel({ settleConfirmed: false, settlement });
    expect(screen.getByRole("status").textContent).toContain("Payout is ready");
    fireEvent.click(screen.getByRole("button", { name: "Claim payout" }));
    expect(settlement.claim).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "Continue to the Floor" })
    ).toBeNull();
  });

  it("continues and rewatches once confirmed", () => {
    const props = renderPanel();
    expect(
      screen.getByRole("list", { name: "Arcade Leverage tier closes" })
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to the Floor" })
    );
    expect(props.onContinue).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(props.onRewatch).toHaveBeenCalledOnce();
  });

  it("hides the replay button and tier board under reduced motion", () => {
    renderPanel({ reducedMotion: true });
    expect(screen.queryByRole("button", { name: "Replay" })).toBeNull();
    expect(
      screen.queryByRole("list", { name: "Arcade Leverage tier closes" })
    ).toBeNull();
  });

  it("surfaces a background settle failure with retry", () => {
    const settlement = makeSettlement({
      status: "error",
      error: "We couldn't claim your payout. Please try again.",
      canRetry: true,
      retryAction: "claim",
    });
    renderPanel({ settleConfirmed: false, settlement });
    expect(screen.getByRole("alert").textContent).toContain("couldn't claim");
    fireEvent.click(screen.getByRole("button", { name: "Retry claim" }));
    expect(settlement.retry).toHaveBeenCalledOnce();
  });
});
