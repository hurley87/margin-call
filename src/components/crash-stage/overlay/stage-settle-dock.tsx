"use client";

import { MarginCallVoiceTrigger } from "@/components/desk-phone/margin-call-voice-trigger";
import { GameButton } from "@/components/ui/game-button";
import type { useCrashTicketSettlement } from "@/hooks/use-crash-ticket-settlement";
import { formatLeverageBps } from "@/lib/margin-call-crash";
import { formatDeskDollarsAmount } from "@/lib/desk-dollars";
import {
  settlementRetryLabels,
  settlementStatusCopy,
} from "@/lib/settlement-status-copy";
import { TERMINAL_ACTION_BUTTON_CLASS } from "@/lib/utils";

type Settlement = ReturnType<typeof useCrashTicketSettlement>;

export type StageSettleDockProps = {
  settlement: Settlement;
};

/**
 * Compact Floor settlement dock. Buttons follow the settlement flags;
 * copy follows the same priority as the awaiting-settle CTA.
 */
export function StageSettleDock({ settlement }: StageSettleDockProps) {
  const ticket = settlement.ticket;
  if (!ticket) return null;

  const kind = settleKind(settlement);
  const isAlert = settlement.status === "error";
  const statusMessage = isAlert
    ? settlement.error
    : (settlementStatusCopy[settlement.status] ?? null);
  const isLiquidatedLoss =
    settlement.outcome === "lost" || settlement.outcome === "settled-loss";
  const retryLabel = settlement.retryAction
    ? settlementRetryLabels[settlement.retryAction]
    : "Retry";
  const busy = settlement.busy;

  return (
    <div className="text-left" data-testid="stage-settle-dock">
      <h2 className="font-[family-name:var(--font-plex-sans)] text-lg font-bold uppercase tracking-tight text-[var(--t-accent)]">
        {kind.title}
      </h2>
      <p className="mt-2 text-sm text-[var(--t-text)]">{kind.body}</p>
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
        {settlement.canVerify ? (
          <GameButton
            className="bg-[var(--t-accent)] text-[var(--t-bg)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]"
            disabled={busy}
            onClick={() => void settlement.verifyAndSettle()}
            size="hero"
          >
            {busy ? "Verifying…" : "Verify and settle"}
          </GameButton>
        ) : null}
        {settlement.canClaim ? (
          <GameButton
            className="bg-[var(--t-accent)] text-[var(--t-bg)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]"
            disabled={busy}
            onClick={() => void settlement.claim()}
            size="hero"
          >
            {busy ? "Claiming…" : "Claim payout"}
          </GameButton>
        ) : null}
        {settlement.canSettle ? (
          <GameButton
            disabled={busy}
            onClick={() => void settlement.settleLoss()}
            size="hero"
            variant="danger"
          >
            {busy ? "Settling…" : "Settle loss"}
          </GameButton>
        ) : null}
        {settlement.canRetry ? (
          <button
            className={TERMINAL_ACTION_BUTTON_CLASS}
            disabled={busy}
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

function settleKind(settlement: Settlement): { title: string; body: string } {
  if (settlement.canVerify) {
    return {
      title: "Verify this round",
      body: "Verify and settle to reveal the Crash Point and see whether your Ticket won or took the margin call.",
    };
  }
  if (settlement.canClaim) {
    return {
      title: "Claim your payout",
      body: "Your Arcade Leverage closed at or below the verified Crash Point.",
    };
  }
  if (settlement.canSettle) {
    return {
      title: "Settle this ticket",
      body: "The Crash Point died below your Arcade Leverage.",
    };
  }
  return {
    title: "Retry settlement",
    body: "The last settlement step did not confirm. Retry to continue.",
  };
}
