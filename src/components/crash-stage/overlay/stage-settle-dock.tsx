"use client";

import { MarginCallVoiceTrigger } from "@/components/desk-phone/margin-call-voice-trigger";
import { GameButton } from "@/components/ui/game-button";
import type { useCrashTicketSettlement } from "@/hooks/use-crash-ticket-settlement";
import { formatLeverageBps } from "@/lib/margin-call-crash";
import { formatDeskDollarsAmount } from "@/lib/desk-dollars";
import { settlementStatusCopy } from "@/lib/settlement-status-copy";
import { TERMINAL_ACTION_BUTTON_CLASS } from "@/lib/utils";
import { ticketResolveCandidates } from "./primary-ticket-resolve-action";

type Settlement = ReturnType<typeof useCrashTicketSettlement>;

export type StageSettleDockProps = {
  settlement: Settlement;
};

type SettleAction = {
  label: string;
  busyLabel: string;
  variant: "primary" | "danger" | "terminal";
  onClick: () => void;
};

const settleBusyLabel: Record<string, string> = {
  "Verify and settle": "Verifying…",
  "Claim payout": "Claiming…",
  "Settle loss": "Settling…",
};

const settleVariant: Record<string, SettleAction["variant"]> = {
  "Verify and settle": "primary",
  "Claim payout": "primary",
  "Settle loss": "danger",
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
  const busy = settlement.busy;
  const actions: SettleAction[] = ticketResolveCandidates({
    settlement,
    refund: null,
  })
    .filter((action) => action.show)
    .map((action) => ({
      label: action.label,
      busyLabel: settleBusyLabel[action.label] ?? action.label,
      variant: settleVariant[action.label] ?? "terminal",
      onClick: action.run,
    }));

  return (
    <div className="text-left" data-testid="stage-settle-dock">
      <h2 className="font-[family-name:var(--font-plex-sans)] text-base font-bold uppercase tracking-tight text-[var(--t-accent)] sm:text-lg">
        {kind.title}
      </h2>
      <p className="mt-1.5 text-sm text-[var(--t-text)] sm:mt-2">{kind.body}</p>
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

      <div className="sticky bottom-0 z-10 -mx-1 mt-3 space-y-3 bg-[var(--t-bg)]/95 px-1 pt-2 backdrop-blur-sm sm:static sm:mx-0 sm:mt-4 sm:bg-transparent sm:px-0 sm:pt-0 sm:backdrop-blur-none">
        {actions.map((action) =>
          action.variant === "terminal" ? (
            <button
              className={`${TERMINAL_ACTION_BUTTON_CLASS} w-full`}
              disabled={busy}
              key={action.label}
              onClick={action.onClick}
              type="button"
            >
              {busy ? action.busyLabel : action.label}
            </button>
          ) : (
            <GameButton
              className={
                action.variant === "primary"
                  ? "w-full bg-[var(--t-accent)] text-[var(--t-bg)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] max-sm:min-h-12 max-sm:px-6 max-sm:py-3.5 max-sm:text-base max-sm:tracking-[0.16em]"
                  : "w-full max-sm:min-h-12 max-sm:px-6 max-sm:py-3.5 max-sm:text-base max-sm:tracking-[0.16em]"
              }
              disabled={busy}
              key={action.label}
              onClick={action.onClick}
              size="hero"
              variant={action.variant === "danger" ? "danger" : "primary"}
            >
              {busy ? action.busyLabel : action.label}
            </GameButton>
          )
        )}
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
