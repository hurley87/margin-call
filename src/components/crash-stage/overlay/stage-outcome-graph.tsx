"use client";

import {
  ReplayCurve,
  type ReplayCurveProps,
} from "@/components/round-theater/replay-curve";

export type StageOutcomeGraphProps = Pick<
  ReplayCurveProps,
  "crashPointBps" | "progress" | "playerTierBps" | "landing"
>;

/**
 * Personal win/loss climb for the Floor. Same attested curve as the theater
 * chart, sized to the remaining viewport above the action dock.
 */
export function StageOutcomeGraph({
  crashPointBps,
  progress,
  playerTierBps,
  landing,
}: StageOutcomeGraphProps) {
  return (
    <div
      className="mx-auto flex h-full min-h-0 w-full max-w-3xl items-stretch"
      data-testid="stage-outcome-graph"
    >
      <ReplayCurve
        crashPointBps={crashPointBps}
        fill
        landing={landing}
        playerTierBps={playerTierBps}
        progress={progress}
      />
    </div>
  );
}
