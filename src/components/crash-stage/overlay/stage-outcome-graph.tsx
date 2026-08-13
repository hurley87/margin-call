"use client";

import { ReplayCurve } from "@/components/round-theater/replay-curve";
import { RoundResultCard } from "@/components/round-theater/round-result-card";
import type { TicketLanding } from "@/components/round-theater/landing-frame";
import type { TheaterReplayHero } from "@/hooks/use-round-theater";

export type StageOutcomeGraphProps = {
  replayHero: TheaterReplayHero;
  landing: TicketLanding;
  progress: number;
  playerTierBps: bigint | null;
  reducedMotion: boolean;
};

/**
 * Floor outcome slot: attested climb graph, or the static result card when
 * motion is reduced. Labels live here; the canvas only supplies particles.
 */
export function StageOutcomeGraph({
  replayHero,
  landing,
  progress,
  playerTierBps,
  reducedMotion,
}: StageOutcomeGraphProps) {
  if (reducedMotion) {
    return (
      <div className="mx-auto w-full max-w-xl">
        <RoundResultCard
          crashPointBps={replayHero.crashPointBps}
          displayCrashPoint={replayHero.displayCrashPoint}
          finalizeTransactionUrl={replayHero.finalizeTransactionUrl}
          landing={landing}
          playerTierBps={playerTierBps}
          tiers={replayHero.tiers}
        />
      </div>
    );
  }

  return (
    <div
      className="mx-auto flex h-full min-h-0 w-full max-w-3xl items-stretch"
      data-testid="stage-outcome-graph"
    >
      <ReplayCurve
        crashPointBps={replayHero.crashPointBps}
        fill
        landing={landing}
        playerTierBps={playerTierBps}
        progress={progress}
      />
    </div>
  );
}
