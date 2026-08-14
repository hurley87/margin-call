"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { MarginCallVoiceTrigger } from "@/components/desk-phone/margin-call-voice-trigger";
import { FinalizeLink } from "@/components/round-theater/finalize-link";
import { theaterCopy } from "@/components/round-theater/theater-copy";
import { TierCloseBoard } from "@/components/round-theater/tier-close-board";
import { GameButton } from "@/components/ui/game-button";
import type { useCrashTicketSettlement } from "@/hooks/use-crash-ticket-settlement";
import { formatDeskDollarsAmount } from "@/lib/desk-dollars";
import {
  formatCrashPointBps,
  type TierExposure,
} from "@/lib/margin-call-crash";
import type { CeremonyReveal, CeremonySnapshot } from "@/lib/settle-ceremony";
import {
  settlementRetryLabels,
  settlementStatusCopy,
} from "@/lib/settlement-status-copy";
import { TERMINAL_ACTION_BUTTON_CLASS } from "@/lib/utils";

type Settlement = ReturnType<typeof useCrashTicketSettlement>;

export type StageOutcomePanelProps = {
  reveal: CeremonyReveal;
  snapshot: CeremonySnapshot;
  settlement: Settlement;
  finalizeTransactionUrl: string | null;
  /** Claim/settle receipt landed — gates Continue. */
  settleConfirmed: boolean;
  reducedMotion: boolean;
  onRewatch: () => void;
  onContinue: () => void;
};

const STAGE_LABELS: Record<string, string> = {
  reveal: "Reveal tx",
  finalize: "Finalize tx",
  claim: "Claim tx",
  settle: "Loss settlement tx",
};

const SM_UP_QUERY = "(min-width: 640px)";

function subscribeSmUp(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(SM_UP_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function readSmUp() {
  if (typeof window.matchMedia !== "function") return true;
  return window.matchMedia(SM_UP_QUERY).matches;
}

/**
 * Held result panel for the ceremony's `landed` phase: the payout number,
 * per-tier closes, every settlement transaction, and the only exit — an
 * explicit Continue. The next round never reclaims the stage on a timer.
 */
export function StageOutcomePanel({
  reveal,
  snapshot,
  settlement,
  finalizeTransactionUrl,
  settleConfirmed,
  reducedMotion,
  onRewatch,
  onContinue,
}: StageOutcomePanelProps) {
  const won = reveal.outcome === "won";
  const isError = settlement.status === "error";
  const pendingLine = settleConfirmed
    ? null
    : isError
      ? settlement.error
      : (settlementStatusCopy[settlement.status] ??
        "Waiting for the settlement receipt on Base Sepolia…");
  const retryLabel = settlement.retryAction
    ? settlementRetryLabels[settlement.retryAction]
    : "Retry";

  const showTierBoard = !reducedMotion && hasTickets(snapshot.tiers);
  // Phones: tier board starts collapsed. `sm+` and SSR/tests keep it open.
  const isSmUp = useSyncExternalStore(subscribeSmUp, readSmUp, () => true);
  const [tiersOpen, setTiersOpen] = useState(isSmUp);
  useEffect(() => {
    setTiersOpen(isSmUp);
  }, [isSmUp]);

  return (
    <div
      className="pointer-events-auto mx-auto flex max-h-[min(52svh,28rem)] w-full max-w-3xl flex-col overflow-hidden rounded-sm border border-[var(--t-border)]/70 bg-[var(--t-bg)]/90 p-3 backdrop-blur-md sm:max-h-[min(60svh,36rem)] sm:p-5"
      data-testid="stage-outcome-panel"
    >
      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p
            className={`font-[family-name:var(--font-plex-sans)] text-base font-black uppercase tracking-tight sm:text-lg ${
              won ? "text-[var(--t-green-hot)]" : "text-[var(--t-red-hot)]"
            }`}
            data-testid="outcome-headline"
          >
            {won
              ? `Won · paid ${formatDeskDollarsAmount(reveal.payout)}`
              : `Margin called · ${formatDeskDollarsAmount(snapshot.ticket.margin)} lost`}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--t-muted)]">
            {theaterCopy.crashPointSupporting(
              formatCrashPointBps(reveal.crashPointBps)
            )}
          </p>
        </div>

        {showTierBoard ? (
          <details
            className="mt-2"
            onToggle={(event) => setTiersOpen(event.currentTarget.open)}
            open={tiersOpen}
          >
            <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--t-accent)] sm:hidden">
              Tier closes
            </summary>
            <div className="max-h-[20svh] overflow-y-auto pr-1 sm:max-h-[26svh]">
              {/* Reduced motion renders RoundResultCard above — its tier board
                  already covers this. */}
              <TierCloseBoard
                crashPointBps={reveal.crashPointBps}
                playerTierBps={snapshot.ticket.leverageBps}
                progress={1}
                tiers={snapshot.tiers}
              />
            </div>
          </details>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <FinalizeLink url={finalizeTransactionUrl} />
          {settlement.transactions.map((t) => (
            <a
              className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--t-accent)] underline decoration-[var(--t-border)] underline-offset-4 hover:text-[var(--t-text)]"
              href={t.url}
              key={t.hash}
              rel="noreferrer"
              target="_blank"
            >
              {STAGE_LABELS[t.stage] ?? "Settlement tx"}
              {t.confirmed ? "" : " (pending)"}
            </a>
          ))}
        </div>

        {!won && settlement.walletAddress ? (
          <div className="mt-3">
            <MarginCallVoiceTrigger
              roundId={snapshot.ticket.roundId}
              ticketId={snapshot.ticket.id}
              walletAddress={settlement.walletAddress}
            />
          </div>
        ) : null}

        {pendingLine ? (
          <p
            className={`mt-3 text-sm ${
              isError ? "text-[var(--t-red)]" : "text-[var(--t-muted)]"
            }`}
            role={isError ? "alert" : "status"}
          >
            {pendingLine}
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex shrink-0 flex-col gap-2 sm:mt-4 sm:flex-row sm:items-stretch sm:gap-3">
        <GameButton
          className="h-12 min-h-12 flex-1 whitespace-nowrap bg-[var(--t-accent)] py-0 text-sm leading-none tracking-[0.16em] text-[var(--t-bg)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-50 sm:h-14 sm:min-h-14 sm:text-base"
          disabled={!settleConfirmed}
          onClick={onContinue}
          size="default"
        >
          {settleConfirmed ? "Continue to the Floor" : "Settling onchain…"}
        </GameButton>
        {!reducedMotion ? (
          <button
            className={`${TERMINAL_ACTION_BUTTON_CLASS} inline-flex h-12 min-h-12 shrink-0 items-center justify-center whitespace-nowrap px-6 py-0 leading-none sm:h-14 sm:min-h-14`}
            onClick={onRewatch}
            type="button"
          >
            {theaterCopy.replayAgain}
          </button>
        ) : null}
        {isError && settlement.canRetry ? (
          <button
            className={`${TERMINAL_ACTION_BUTTON_CLASS} inline-flex h-12 min-h-12 shrink-0 items-center justify-center whitespace-nowrap px-6 py-0 leading-none sm:h-14 sm:min-h-14`}
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

function hasTickets(tiers: readonly TierExposure[]): boolean {
  return tiers.some((tier) => tier.ticketCount > 0);
}
