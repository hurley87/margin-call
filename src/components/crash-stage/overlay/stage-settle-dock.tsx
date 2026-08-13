"use client";

import { MarginCallVoiceTrigger } from "@/components/desk-phone/margin-call-voice-trigger";
import { GameButton } from "@/components/ui/game-button";
import type { useCrashTicketSettlement } from "@/hooks/use-crash-ticket-settlement";
import { formatLeverageBps } from "@/lib/margin-call-crash";
import { formatDeskDollarsAmount } from "@/lib/desk-dollars";
import { settlementStatusCopy } from "@/lib/settlement-status-copy";
import { TERMINAL_ACTION_BUTTON_CLASS } from "@/lib/utils";
import type { StageCtaKind } from "../use-crash-stage-mode";

type Settlement = ReturnType<typeof useCrashTicketSettlement>;

const retryLabels = {
  refresh: "Retry",
  verify: "Retry verify and settle",
  claim: "Retry claim",
  settle: "Retry settle loss",
  "reveal-receipt-check": "Retry reveal receipt check",
  "finalize-receipt-check": "Retry finalization receipt check",
  "claim-receipt-check": "Retry claim receipt check",
  "settle-receipt-check": "Retry settle receipt check",
} as const;

export type StageSettleDockProps = {
  ctaKind: Exclude<StageCtaKind, "none" | "enter" | "refund" | "expire">;
  settlement: Settlement;
};

/**
 * Compact Floor settlement dock. Verify / claim / settle stay in the first
 * viewport — never nested under a ticket card in a scroll region.
 */
export function StageSettleDock({ ctaKind, settlement }: StageSettleDockProps) {
  const ticket = settlement.ticket;
  if (!ticket) return null;

  const isAlert = settlement.status === "error";
  const statusMessage = isAlert
    ? settlement.error
    : (settlementStatusCopy[settlement.status] ?? null);
  const isLiquidatedLoss =
    settlement.outcome === "lost" || settlement.outcome === "settled-loss";
  const retryLabel = settlement.retryAction
    ? retryLabels[settlement.retryAction]
    : "Retry";

  return (
    <div className="text-left" data-testid="stage-settle-dock">
      <h2 className="font-[family-name:var(--font-plex-sans)] text-lg font-bold uppercase tracking-tight text-[var(--t-accent)]">
        {dockTitle(ctaKind)}
      </h2>
      <p className="mt-2 text-sm text-[var(--t-text)]">{dockBody(ctaKind)}</p>
      <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--t-muted)]">
        {formatDeskDollarsAmount(ticket.margin)} ·{" "}
        {formatLeverageBps(ticket.leverageBps)}
        {settlement.displayCrashPoint
          ? ` · Crash Point ${settlement.displayCrashPoint}`
          : null}
      </p>

      {isLiquidatedLoss && settlement.walletAddress ? (
        <div className="mt-3">
          <MarginCallVoiceTrigger
            roundId={ticket.roundId}
            ticketId={ticket.id}
            walletAddress={settlement.walletAddress}
          />
        </div>
      ) : null}

      {statusMessage ? (
        <p
          className={`mt-3 text-sm ${
            isAlert ? "text-[var(--t-red)]" : "text-[var(--t-muted)]"
          }`}
          role={isAlert ? "alert" : "status"}
        >
          {statusMessage}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-3">
        {ctaKind === "verify" ? (
          <GameButton
            className="bg-[var(--t-accent)] text-[var(--t-bg)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]"
            disabled={!settlement.canVerify}
            onClick={() => void settlement.verifyAndSettle()}
            size="hero"
          >
            Verify and settle
          </GameButton>
        ) : null}
        {ctaKind === "claim" ? (
          <GameButton
            className="bg-[var(--t-accent)] text-[var(--t-bg)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]"
            disabled={!settlement.canClaim}
            onClick={() => void settlement.claim()}
            size="hero"
          >
            Claim payout
          </GameButton>
        ) : null}
        {ctaKind === "settle-loss" ? (
          <GameButton
            disabled={!settlement.canSettle}
            onClick={() => void settlement.settleLoss()}
            size="hero"
            variant="danger"
          >
            Settle loss
          </GameButton>
        ) : null}
        {ctaKind === "retry" || settlement.canRetry ? (
          <button
            className={TERMINAL_ACTION_BUTTON_CLASS}
            onClick={() => void settlement.retry()}
            type="button"
          >
            {retryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function dockTitle(kind: StageSettleDockProps["ctaKind"]): string {
  switch (kind) {
    case "verify":
      return "Verify this round";
    case "claim":
      return "Claim your payout";
    case "settle-loss":
      return "Settle this ticket";
    case "retry":
      return "Retry settlement";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function dockBody(kind: StageSettleDockProps["ctaKind"]): string {
  switch (kind) {
    case "verify":
      return "Verify and settle to reveal the Crash Point and see whether your Ticket won or took the margin call.";
    case "claim":
      return "Your Arcade Leverage closed at or below the verified Crash Point.";
    case "settle-loss":
      return "The Crash Point died below your Arcade Leverage.";
    case "retry":
      return "The last settlement step did not confirm. Retry to continue.";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
