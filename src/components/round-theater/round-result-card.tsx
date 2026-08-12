"use client";

import type { TierExposure } from "@/lib/margin-call-crash";
import { FinalizeLink } from "./finalize-link";
import { presentLanding, type TicketLanding } from "./landing-frame";
import { TierCloseBoard } from "./tier-close-board";
import { theaterCopy } from "./theater-copy";

export type RoundResultCardProps = {
  displayCrashPoint: string;
  crashPointBps: bigint;
  tiers: readonly TierExposure[];
  finalizeTransactionUrl: string | null;
  /** Personal vs spectator freeze — same model as the animated climb. */
  landing?: TicketLanding;
  /** Signed-in player's Arcade Leverage — marks their row on the tier board. */
  playerTierBps?: bigint | null;
};

/**
 * Reduced-motion equivalent of the climb. Renders the shared landing frame
 * plus tier closes and the verification link. Colour- and sound-independent.
 */
export function RoundResultCard({
  displayCrashPoint,
  crashPointBps,
  tiers,
  finalizeTransactionUrl,
  landing = { kind: "spectator" },
  playerTierBps = null,
}: RoundResultCardProps) {
  const freeze = presentLanding(landing, displayCrashPoint);

  return (
    <div
      aria-label={theaterCopy.staticResult}
      className="terminal-panel p-4 sm:p-5"
    >
      <p className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
        {freeze.heroLabel}
      </p>
      <p
        className={`mc-live-value mt-2 font-[family-name:var(--font-plex-sans)] text-5xl font-bold sm:text-6xl ${
          freeze.heroIsMultiplier ? "tabular-nums" : ""
        } ${freeze.heroColorClass}`}
        data-testid={
          landing.kind === "spectator" ? "static-crash-point" : "static-outcome"
        }
      >
        {freeze.heroValue}
      </p>
      {freeze.supportingCrashPoint ? (
        <p
          className="mt-1 text-sm font-bold tabular-nums text-[var(--t-muted)]"
          data-testid="static-crash-point-supporting"
        >
          {freeze.supportingCrashPoint}
        </p>
      ) : null}
      {freeze.outcomeDetail ? (
        <p className="mt-2 text-xs leading-5 text-[var(--t-muted)]">
          {freeze.outcomeDetail}
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

      {freeze.showMarginCallStamp ? (
        <>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--t-red-hot)]">
            {theaterCopy.marginCall}
          </p>
          {freeze.stampDetail ? (
            <p className="mt-1 text-xs text-[var(--t-muted)]">
              {freeze.stampDetail}
            </p>
          ) : null}
        </>
      ) : null}

      <FinalizeLink className="mt-4 inline-flex" url={finalizeTransactionUrl} />
    </div>
  );
}
