"use client";

import { useEffect, useMemo, useRef } from "react";
import { ENTRY_LEVERAGE_TIERS_BPS } from "@/lib/margin-call-crash";
import { getTierCloseProgress } from "@/lib/round-replay";
import { getTheaterAudio } from "@/lib/theater-audio";

/**
 * Tier-close and crash-bell SFX for Replay climbs. Shared by RoundTheater and
 * CrashStage so Floor and SVG theater stay in sync.
 */
export function useTheaterTierSounds(options: {
  crashPointBps: bigint | null;
  progress: number;
  isComplete: boolean;
  enabled: boolean;
  restartNonce?: number;
  playerTierBps: bigint | null;
}) {
  const closeThresholds = useMemo(() => {
    if (options.crashPointBps === null) return [];
    return ENTRY_LEVERAGE_TIERS_BPS.flatMap((tier) => {
      const closeAt = getTierCloseProgress(tier, options.crashPointBps!);
      if (closeAt === null) return [];
      return [
        {
          closeAt,
          isPlayerTier:
            options.playerTierBps !== null && tier === options.playerTierBps,
        },
      ];
    }).sort((a, b) => a.closeAt - b.closeAt);
  }, [options.crashPointBps, options.playerTierBps]);

  const firedCountRef = useRef(0);
  const crashedRef = useRef(false);

  useEffect(() => {
    firedCountRef.current = 0;
    crashedRef.current = false;
  }, [options.restartNonce, options.crashPointBps]);

  useEffect(() => {
    if (!options.enabled || options.crashPointBps === null) return;
    while (
      firedCountRef.current < closeThresholds.length &&
      closeThresholds[firedCountRef.current]!.closeAt <= options.progress
    ) {
      const threshold = closeThresholds[firedCountRef.current]!;
      firedCountRef.current += 1;
      if (threshold.isPlayerTier) getTheaterAudio().playWinRegister();
      else getTheaterAudio().playTierClose();
    }
    if (options.isComplete && !crashedRef.current) {
      crashedRef.current = true;
      const audio = getTheaterAudio();
      audio.playCrashBell();
      audio.playPhoneRing();
    }
  }, [
    closeThresholds,
    options.crashPointBps,
    options.enabled,
    options.isComplete,
    options.progress,
  ]);
}
