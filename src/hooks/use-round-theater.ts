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
  type FinalizedReplayRound,
  type MarginCallCrashConfig,
  type RoundTicketTape,
  type TierExposure,
} from "@/lib/margin-call-crash";
import { roundPhaseCopy } from "@/lib/round-phase-copy";
import { isReplayHoldActive } from "@/lib/round-replay";
import type { RoundTimeline } from "@/lib/round-timeline";

export type TheaterLive =
  | { kind: "loading" }
  | { kind: "error" | "unavailable"; error: string }
  | {
      kind: "open";
      roundId: bigint;
      tape: RoundTicketTape | null;
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
    }
  | {
      kind: "expired";
      roundId: bigint;
      tape: RoundTicketTape | null;
      timeline: RoundTimeline;
    };

export type TheaterReplayHero = {
  type: "replay";
  roundId: bigint;
  crashPointBps: bigint;
  displayCrashPoint: string;
  finalizedAtSeconds: bigint | null;
  chainTimestamp: bigint;
  finalizeTransactionUrl: string | null;
  tape: RoundTicketTape | null;
  tiers: TierExposure[];
};

export type TheaterHero =
  | { type: "empty" }
  | { type: "pending"; title: string; body?: string }
  | TheaterReplayHero
  | {
      type: "ambiance";
      roundId: bigint;
      crashPointBps: bigint;
      displayCrashPoint: string;
    };

export type TheaterView = {
  reducedMotion: boolean;
  retry: () => Promise<void>;
  live: TheaterLive;
  hero: TheaterHero;
};

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
 *
 * `live` is always chain truth. `hero` is what the chart shows: a held previous
 * replay, this round's replay, looping ambiance, or a pending/empty panel.
 */
export function useRoundTheater(): TheaterView {
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
      toTheaterView({
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

function ambianceFromRetained(retained: RetainedFinalized): TheaterHero {
  return {
    type: "ambiance",
    roundId: retained.roundId,
    crashPointBps: retained.crashPointBps,
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

function toTheaterView(options: {
  round: CurrentCrashRoundView;
  reducedMotion: boolean;
  tape: RoundTicketTape | null;
  ambiance: FinalizedReplayRound | null;
  retained: RetainedFinalized | null;
  retryTape: () => Promise<void>;
  retryAmbiance: () => Promise<void>;
}): TheaterView {
  const { round, reducedMotion, tape, ambiance, retained } = options;
  const retry = async () => {
    await round.retry();
    await options.retryTape();
    await options.retryAmbiance();
  };

  if (round.status !== "ready") {
    if (round.status === "loading") {
      return {
        live: { kind: "loading" },
        hero: { type: "empty" },
        reducedMotion,
        retry,
      };
    }
    return {
      live: { kind: round.status, error: round.error },
      hero: { type: "empty" },
      reducedMotion,
      retry,
    };
  }

  const phase = round.phase;

  if (isPreLockPhase(phase)) {
    const live: Extract<TheaterLive, { kind: "open" }> = {
      kind: "open",
      roundId: round.roundId,
      tape,
      timeline: round.timeline,
    };

    // Display-round hold: keep the just-finished result playing out into the
    // next entry window. Live stays the open round; hero keeps N-1.
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
        live,
        hero: replayHeroFromRetained(retained, round.chainTimestamp),
        reducedMotion,
        retry,
      };
    }

    return {
      live,
      hero:
        retained !== null
          ? ambianceFromRetained(retained)
          : ambianceHero(ambiance),
      reducedMotion,
      retry,
    };
  }

  if (
    phase === "locked" ||
    phase === "reveal-requested" ||
    phase === "expired-eligible"
  ) {
    const copy = roundPhaseCopy[phase];
    return {
      live: {
        kind: "delayed",
        roundId: round.roundId,
        phaseLabel: phase,
        tape,
        timeline: round.timeline,
      },
      hero: { type: "pending", title: copy.title, body: copy.body },
      reducedMotion,
      retry,
    };
  }

  if (phase === "finalized") {
    if (round.crashPointBps === null || round.displayCrashPoint === null) {
      const copy = roundPhaseCopy["reveal-requested"];
      return {
        live: {
          kind: "delayed",
          roundId: round.roundId,
          phaseLabel: "reveal-requested",
          tape,
          timeline: round.timeline,
        },
        hero: { type: "pending", title: copy.title, body: copy.body },
        reducedMotion,
        retry,
      };
    }
    const live: Extract<TheaterLive, { kind: "finalized" }> = {
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
    };
    return {
      live,
      hero: replayHeroFromLive(live),
      reducedMotion,
      retry,
    };
  }

  if (phase === "expired") {
    const copy = roundPhaseCopy.expired;
    return {
      live: {
        kind: "expired",
        roundId: round.roundId,
        tape,
        timeline: round.timeline,
      },
      hero: { type: "pending", title: copy.title, body: copy.body },
      reducedMotion,
      retry,
    };
  }

  const _exhaustive: never = phase;
  return _exhaustive;
}

function ambianceHero(ambiance: FinalizedReplayRound | null): TheaterHero {
  if (ambiance === null) return { type: "empty" };
  return {
    type: "ambiance",
    roundId: ambiance.round.id,
    crashPointBps: ambiance.round.crashPointBps,
    displayCrashPoint: ambiance.displayCrashPoint,
  };
}

function replayHeroFromRetained(
  retained: RetainedFinalized,
  chainTimestamp: bigint
): TheaterReplayHero {
  return {
    type: "replay",
    roundId: retained.roundId,
    crashPointBps: retained.crashPointBps,
    displayCrashPoint: retained.displayCrashPoint,
    finalizedAtSeconds: retained.finalizedAtSeconds,
    chainTimestamp,
    finalizeTransactionUrl: retained.finalizeTransactionUrl,
    tape: retained.tape,
    tiers: retained.tiers,
  };
}

function replayHeroFromLive(
  live: Extract<TheaterLive, { kind: "finalized" }>
): TheaterReplayHero {
  return {
    type: "replay",
    roundId: live.roundId,
    crashPointBps: live.crashPointBps,
    displayCrashPoint: live.displayCrashPoint,
    finalizedAtSeconds: live.finalizedAtSeconds,
    chainTimestamp: live.chainTimestamp,
    finalizeTransactionUrl: live.finalizeTransactionUrl,
    tape: live.tape,
    tiers: live.tiers,
  };
}
