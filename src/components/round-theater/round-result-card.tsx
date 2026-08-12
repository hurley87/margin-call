"use client";

import type { TierExposure } from "@/lib/margin-call-crash";
import { FinalizeLink } from "./finalize-link";
import { TierCloseBoard } from "./tier-close-board";
import { theaterCopy } from "./theater-copy";

export type RoundResultCardProps = {
  displayCrashPoint: string;
  crashPointBps: bigint;
  tiers: readonly TierExposure[];
  finalizeTransactionUrl: string | null;
  /**
   * Personal landing frame matching the animated climb's freeze.
   * `true` → Won, `false` → Margin called, `null` → spectator (Crash Point).
   */
  playerWon?: boolean | null;
  /** Signed-in player's Arcade Leverage — marks their row on the tier board. */
  playerTierBps?: bigint | null;
};

/**
 * Reduced-motion equivalent of the climb. Carries identical facts: verified
 * Crash Point (or personal Won / Margin called freeze), each tier's
 * close-or-margin-call state and payout, and the verification link.
 * Colour- and sound-independent.
 */
export function RoundResultCard({
  displayCrashPoint,
  crashPointBps,
  tiers,
  finalizeTransactionUrl,
  playerWon = null,
  playerTierBps = null,
}: RoundResultCardProps) {
  const showPlayerOutcome = playerWon !== null;
  const heroValue = showPlayerOutcome
    ? playerWon
      ? theaterCopy.playerWon
      : theaterCopy.playerMarginCalled
    : displayCrashPoint;
  const heroColor =
    showPlayerOutcome && playerWon
      ? "text-[var(--t-green-hot)]"
      : showPlayerOutcome
        ? "text-[var(--t-red-hot)]"
        : "text-[var(--t-green-hot)]";
  const outcomeDetail =
    playerWon === true
      ? theaterCopy.playerWonDetail
      : playerWon === false
        ? theaterCopy.playerMarginCalledDetail
        : null;
  // Phone / market-die stamp: spectators and losers only — not winners.
  const showMarginCallStamp = playerWon !== true;

  return (
    <div
      aria-label={theaterCopy.staticResult}
      className="terminal-panel p-4 sm:p-5"
    >
      <p className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
        {showPlayerOutcome
          ? theaterCopy.yourTicket
          : theaterCopy.verifiedCrashPoint}
      </p>
      <p
        className={`mc-live-value mt-2 font-[family-name:var(--font-plex-sans)] text-5xl font-bold sm:text-6xl ${
          showPlayerOutcome ? "" : "tabular-nums"
        } ${heroColor}`}
        data-testid={
          showPlayerOutcome ? "static-outcome" : "static-crash-point"
        }
      >
        {heroValue}
      </p>
      {showPlayerOutcome ? (
        <p
          className="mt-1 text-sm font-bold tabular-nums text-[var(--t-muted)]"
          data-testid="static-crash-point-supporting"
        >
          {theaterCopy.crashPointSupporting(displayCrashPoint)}
        </p>
      ) : null}
      {outcomeDetail ? (
        <p className="mt-2 text-xs leading-5 text-[var(--t-muted)]">
          {outcomeDetail}
        </p>
      ) : null}
      <p className="mt-3 text-xs leading-5 text-[var(--t-muted)]">
        {theaterCopy.replayLabel}. {theaterCopy.replayDetail}
      </p>

      <TierCloseBoard
        crashPointBps={crashPointBps}
        playerTierBps={playerTierBps}
        progress={1}
        tiers={tiers}
      />

      {showMarginCallStamp ? (
        <>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--t-red-hot)]">
            {theaterCopy.marginCall}
          </p>
          <p className="mt-1 text-xs text-[var(--t-muted)]">
            {playerWon === false
              ? theaterCopy.playerMarginCalledDetail
              : theaterCopy.marginCallDetail}
          </p>
        </>
      ) : null}

      <FinalizeLink className="mt-4 inline-flex" url={finalizeTransactionUrl} />
    </div>
  );
}
