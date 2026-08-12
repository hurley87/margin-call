"use client";

import { useEffect, useRef, useState } from "react";
import {
  getReplayDurationMs,
  getReplayProgress,
  isReplayComplete,
} from "@/lib/round-replay";

export type ReplayClockOptions = {
  /** Attested Crash Point in basis points. Null disables the clock. */
  crashPointBps: bigint | null;
  /**
   * Unix seconds when RoundFinalized landed. Combined with chainTimestamp to
   * seed elapsed time so mid-arrival clients seek to the correct frame.
   */
  finalizedAtSeconds: bigint | null;
  /** Client-corrected chain time in Unix seconds. */
  chainTimestamp: bigint | null;
  /** When true, never starts a rAF loop — caller renders a static card. */
  reducedMotion?: boolean;
  /**
   * Local restart nonce. Incrementing restarts the climb from 1.00x without
   * touching settlement. Inert beyond presentation.
   */
  restartNonce?: number;
  /** When true, loops the climb (Open-phase ambiance). */
  loop?: boolean;
};

export type ReplayClock = {
  progress: number;
  isComplete: boolean;
};

/**
 * Deterministic replay clock. Seeded from chain time for cross-client seek,
 * then advanced with requestAnimationFrame for sub-second smoothness.
 */
export function useReplayClock(options: ReplayClockOptions): ReplayClock {
  const {
    crashPointBps,
    finalizedAtSeconds,
    chainTimestamp,
    reducedMotion = false,
    restartNonce = 0,
    loop = false,
  } = options;

  const durationMs =
    crashPointBps !== null ? getReplayDurationMs(crashPointBps) : 0;

  const seedElapsedMs = (() => {
    if (
      crashPointBps === null ||
      finalizedAtSeconds === null ||
      chainTimestamp === null
    ) {
      return 0;
    }
    const elapsedSeconds = Number(chainTimestamp - finalizedAtSeconds);
    return Math.max(0, elapsedSeconds * 1_000);
  })();

  const generation = `${crashPointBps?.toString() ?? "null"}:${finalizedAtSeconds?.toString() ?? "null"}:${restartNonce}:${loop}`;

  const [anim, setAnim] = useState<{
    generation: string;
    elapsedMs: number;
  } | null>(null);

  // Read the seed through a ref so a fresh chainTimestamp on each poll doesn't
  // tear down and restart the running rAF loop; only `generation` restarts it.
  const seedRef = useRef(seedElapsedMs);
  useEffect(() => {
    seedRef.current = seedElapsedMs;
  }, [seedElapsedMs]);

  useEffect(() => {
    if (
      reducedMotion ||
      crashPointBps === null ||
      typeof window === "undefined"
    ) {
      return;
    }

    let frame = 0;
    let cancelled = false;
    const start = performance.now();
    const seed = seedRef.current;
    const activeGeneration = generation;

    const tick = (now: number) => {
      if (cancelled) return;
      let elapsed = seed + (now - start);
      if (loop && durationMs > 0) {
        elapsed = elapsed % durationMs;
      }
      setAnim({ generation: activeGeneration, elapsedMs: elapsed });
      const nextProgress = getReplayProgress(elapsed, crashPointBps);
      if (!loop && nextProgress >= 1) return;
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [crashPointBps, durationMs, generation, loop, reducedMotion]);

  const elapsedMs =
    anim !== null && anim.generation === generation
      ? anim.elapsedMs
      : seedElapsedMs;
  const progress =
    crashPointBps !== null ? getReplayProgress(elapsedMs, crashPointBps) : 0;

  return {
    progress,
    isComplete: isReplayComplete(progress),
  };
}
