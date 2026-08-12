"use client";

import { useMemo, useState } from "react";
import {
  useCurrentCrashRound,
  type CurrentCrashRoundView,
} from "@/hooks/use-current-crash-round";
import { usePolledCrashRead } from "@/hooks/use-polled-crash-read";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  aggregateTierExposure,
  isPreLockPhase,
  readLatestFinalizedReplayRound,
  readRoundTicketTape,
  type MarginCallCrashConfig,
  type RoundTicketTape,
  type TierExposure,
} from "@/lib/margin-call-crash";
import { isReplayHoldActive } from "@/lib/round-replay";
import type {
  RoundTimeline,
  RoundTimelineCountdown,
} from "@/lib/round-timeline";

export type TheaterStageKind =
  | "loading"
  | "error"
  | "unavailable"
  | "open"
  | "delayed"
  | "finalized"
  | "expired";

type TheaterBase = {
  retry: () => Promise<void>;
  reducedMotion: boolean;
};

/** Live info about the upcoming round shown alongside a finished result. */
export type TheaterNextRound = {
  roundId: bigint;
  countdown: RoundTimelineCountdown;
};

/** Previous-result replay shown during Open. */
export type TheaterOpenAmbiance = {
  round: { id: bigint; crashPointBps: bigint };
  displayCrashPoint: string;
};

export type TheaterStage = TheaterBase &
  (
    | { kind: "loading" }
    | { kind: "error" | "unavailable"; error: string }
    | {
        kind: "open";
        roundId: bigint;
        countdownSeconds: number;
        tape: RoundTicketTape | null;
        ambiance: TheaterOpenAmbiance | null;
        timeline: RoundTimeline;
      }
    | {
        kind: "delayed";
        roundId: bigint;
        phaseLabel: "locked" | "reveal-requested" | "expired-eligible";
        tape: RoundTicketTape | null;
        timeline: RoundTimeline;
      }
    | {
        kind: "finalized";
        roundId: bigint;
        crashPointBps: bigint;
        displayCrashPoint: string;
        finalizedAtSeconds: bigint | null;
        chainTimestamp: bigint;
        finalizeTransactionUrl: string | null;
        tape: RoundTicketTape | null;
        tiers: TierExposure[];
        timeline: RoundTimeline;
        /** Non-null while this result is held past its own epoch, or while the
         * next epoch counts down — always sourced from the live round. */
        next: TheaterNextRound | null;
      }
    | {
        kind: "expired";
        roundId: bigint;
        tape: RoundTicketTape | null;
        timeline: RoundTimeline;
      }
  );

/** Frozen copy of the last fully-finalized round, for the display hold. */
type RetainedFinalized = {
  roundId: bigint;
  crashPointBps: bigint;
  displayCrashPoint: string;
  finalizedAtSeconds: bigint;
  finalizeTransactionUrl: string | null;
  tape: RoundTicketTape | null;
  tiers: TierExposure[];
};

/**
 * Presentation-only theater state. Composes public round reads and ticket tape
 * — never imports settlement or entry transaction hooks.
 */
export function useRoundTheater(): TheaterStage {
  const round = useCurrentCrashRound();
  const reducedMotion = useReducedMotion();

  const roundIdForTape = round.status === "ready" ? round.roundId : null;

  const tapeRead = useMemo(() => {
    if (roundIdForTape === null) return null;
    return (config: MarginCallCrashConfig) =>
      readRoundTicketTape(config, roundIdForTape);
  }, [roundIdForTape]);

  const tapePoll = usePolledCrashRead(tapeRead);

  // Retain the newest fully-finalized round we've seen so its replay can hold
  // the hero across the epoch flip. Overwritten by supersession, never
  // cleared. Adjusted during render (guarded) per the React "state from
  // previous renders" pattern — no effect, no extra render pass when idle.
  const [retained, setRetained] = useState<RetainedFinalized | null>(null);
  const candidate = deriveRetainedCandidate(round, tapePoll.data);
  if (
    candidate !== null &&
    (retained === null ||
      retained.roundId !== candidate.roundId ||
      retained.tape !== candidate.tape)
  ) {
    setRetained(candidate);
  }

  // Mid-arrival only: retained already is the previous result, and the hold
  // covers the epoch flip. Poll lookback solely when open has nothing to show.
  const needsAmbiance =
    round.status === "ready" &&
    isPreLockPhase(round.phase) &&
    retained === null;

  const ambianceRead = useMemo(() => {
    if (!needsAmbiance) return null;
    return (config: MarginCallCrashConfig) =>
      readLatestFinalizedReplayRound(config);
  }, [needsAmbiance]);
  const ambiancePoll = usePolledCrashRead(ambianceRead);

  return useMemo(
    () =>
      toTheaterStage({
        round,
        reducedMotion,
        tape: tapePoll.data,
        ambiance: ambiancePoll.data,
        retained,
        retryTape: tapePoll.refresh,
        retryAmbiance: ambiancePoll.refresh,
      }),
    [
      ambiancePoll.data,
      ambiancePoll.refresh,
      reducedMotion,
      retained,
      round,
      tapePoll.data,
      tapePoll.refresh,
    ]
  );
}

function ambianceFromRetained(
  retained: RetainedFinalized
): TheaterOpenAmbiance {
  return {
    round: {
      id: retained.roundId,
      crashPointBps: retained.crashPointBps,
    },
    displayCrashPoint: retained.displayCrashPoint,
  };
}

function deriveRetainedCandidate(
  round: CurrentCrashRoundView,
  tape: RoundTicketTape | null
): RetainedFinalized | null {
  if (round.status !== "ready" || round.phase !== "finalized") return null;
  if (
    round.crashPointBps === null ||
    round.displayCrashPoint === null ||
    round.finalizedAtSeconds === null
  ) {
    return null;
  }
  const roundTape = tape?.roundId === round.roundId ? tape : null;
  return {
    roundId: round.roundId,
    crashPointBps: round.crashPointBps,
    displayCrashPoint: round.displayCrashPoint,
    finalizedAtSeconds: round.finalizedAtSeconds,
    finalizeTransactionUrl: round.finalizeTransactionUrl,
    tape: roundTape,
    tiers: roundTape?.tiers ?? aggregateTierExposure([]),
  };
}

function toTheaterStage(options: {
  round: CurrentCrashRoundView;
  reducedMotion: boolean;
  tape: RoundTicketTape | null;
  ambiance: TheaterOpenAmbiance | null;
  retained: RetainedFinalized | null;
  retryTape: () => Promise<void>;
  retryAmbiance: () => Promise<void>;
}): TheaterStage {
  const { round, reducedMotion, tape, ambiance, retained } = options;
  const retry = async () => {
    await round.retry();
    await options.retryTape();
    await options.retryAmbiance();
  };

  if (round.status !== "ready") {
    if (round.status === "loading") {
      return { kind: "loading", reducedMotion, retry };
    }
    return {
      kind: round.status,
      error: round.error,
      reducedMotion,
      retry,
    };
  }

  const phase = round.phase;

  if (isPreLockPhase(phase)) {
    // Display-round hold: keep the just-finished result playing out into the
    // next entry window, with the live round's countdown alongside.
    if (
      retained !== null &&
      retained.roundId === round.roundId - 1n &&
      isReplayHoldActive(
        retained.finalizedAtSeconds,
        retained.crashPointBps,
        round.chainTimestamp
      )
    ) {
      return {
        kind: "finalized",
        roundId: retained.roundId,
        crashPointBps: retained.crashPointBps,
        displayCrashPoint: retained.displayCrashPoint,
        finalizedAtSeconds: retained.finalizedAtSeconds,
        chainTimestamp: round.chainTimestamp,
        finalizeTransactionUrl: retained.finalizeTransactionUrl,
        tape: retained.tape,
        tiers: retained.tiers,
        timeline: round.timeline,
        next: {
          roundId: round.roundId,
          countdown: round.timeline.countdown,
        },
        reducedMotion,
        retry,
      };
    }
    return {
      kind: "open",
      roundId: round.roundId,
      countdownSeconds: round.countdownSeconds,
      tape,
      ambiance: retained !== null ? ambianceFromRetained(retained) : ambiance,
      timeline: round.timeline,
      reducedMotion,
      retry,
    };
  }

  if (
    phase === "locked" ||
    phase === "reveal-requested" ||
    phase === "expired-eligible"
  ) {
    return {
      kind: "delayed",
      roundId: round.roundId,
      phaseLabel: phase,
      tape,
      timeline: round.timeline,
      reducedMotion,
      retry,
    };
  }

  if (phase === "finalized") {
    if (round.crashPointBps === null || round.displayCrashPoint === null) {
      return {
        kind: "delayed",
        roundId: round.roundId,
        phaseLabel: "reveal-requested",
        tape,
        timeline: round.timeline,
        reducedMotion,
        retry,
      };
    }
    return {
      kind: "finalized",
      roundId: round.roundId,
      crashPointBps: round.crashPointBps,
      displayCrashPoint: round.displayCrashPoint,
      finalizedAtSeconds: round.finalizedAtSeconds,
      chainTimestamp: round.chainTimestamp,
      finalizeTransactionUrl: round.finalizeTransactionUrl,
      tape,
      tiers: tape?.tiers ?? aggregateTierExposure([]),
      timeline: round.timeline,
      next: {
        roundId: round.roundId + 1n,
        countdown: round.timeline.countdown,
      },
      reducedMotion,
      retry,
    };
  }

  if (phase === "expired") {
    return {
      kind: "expired",
      roundId: round.roundId,
      tape,
      timeline: round.timeline,
      reducedMotion,
      retry,
    };
  }

  const _exhaustive: never = phase;
  return _exhaustive;
}
