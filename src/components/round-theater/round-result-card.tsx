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
};

/**
 * Reduced-motion equivalent of the climb. Carries identical facts: verified
 * Crash Point, each tier's close-or-margin-call state and payout, and the
 * verification link. Colour- and sound-independent.
 */
export function RoundResultCard({
  displayCrashPoint,
  crashPointBps,
  tiers,
  finalizeTransactionUrl,
}: RoundResultCardProps) {
  return (
    <div
      aria-label={theaterCopy.staticResult}
      className="terminal-panel p-4 sm:p-5"
    >
      <p className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
        {theaterCopy.verifiedCrashPoint}
      </p>
      <p
        className="mc-live-value mt-2 font-[family-name:var(--font-plex-sans)] text-5xl font-bold tabular-nums text-[var(--t-green-hot)] sm:text-6xl"
        data-testid="static-crash-point"
      >
        {displayCrashPoint}
      </p>
      <p className="mt-3 text-xs leading-5 text-[var(--t-muted)]">
        {theaterCopy.replayLabel}. {theaterCopy.replayDetail}
      </p>

      <TierCloseBoard
        crashPointBps={crashPointBps}
        progress={1}
        tiers={tiers}
      />

      <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--t-red-hot)]">
        {theaterCopy.marginCall}
      </p>
      <p className="mt-1 text-xs text-[var(--t-muted)]">
        {theaterCopy.marginCallDetail}
      </p>

      <FinalizeLink className="mt-4 inline-flex" url={finalizeTransactionUrl} />
    </div>
  );
}
