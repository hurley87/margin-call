"use client";

import { useCallback, useMemo } from "react";
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

export type TheaterStage = TheaterBase &
  (
    | { kind: "loading" }
    | { kind: "error" | "unavailable"; error: string }
    | {
        kind: "open";
        roundId: bigint;
        countdownSeconds: number;
        tape: RoundTicketTape | null;
        ambiance: FinalizedReplayRound | null;
      }
    | {
        kind: "delayed";
        roundId: bigint;
        phaseLabel: "locked" | "reveal-requested" | "expired-eligible";
        tape: RoundTicketTape | null;
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
      }
    | {
        kind: "expired";
        roundId: bigint;
        tape: RoundTicketTape | null;
      }
  );

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

  const needsAmbiance = round.status === "ready" && isPreLockPhase(round.phase);

  const ambianceRead = useCallback(
    (config: Parameters<typeof readLatestFinalizedReplayRound>[0]) =>
      readLatestFinalizedReplayRound(config),
    []
  );

  const ambiancePoll = usePolledCrashRead(needsAmbiance ? ambianceRead : null);

  return useMemo(
    () =>
      toTheaterStage({
        round,
        reducedMotion,
        tape: tapePoll.data,
        ambiance: needsAmbiance ? ambiancePoll.data : null,
        retryTape: tapePoll.refresh,
        retryAmbiance: ambiancePoll.refresh,
      }),
    [
      ambiancePoll.data,
      ambiancePoll.refresh,
      needsAmbiance,
      reducedMotion,
      round,
      tapePoll.data,
      tapePoll.refresh,
    ]
  );
}

function toTheaterStage(options: {
  round: CurrentCrashRoundView;
  reducedMotion: boolean;
  tape: RoundTicketTape | null;
  ambiance: FinalizedReplayRound | null;
  retryTape: () => Promise<void>;
  retryAmbiance: () => Promise<void>;
}): TheaterStage {
  const { round, reducedMotion, tape, ambiance } = options;
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
    return {
      kind: "open",
      roundId: round.roundId,
      countdownSeconds: round.countdownSeconds,
      tape,
      ambiance,
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
      reducedMotion,
      retry,
    };
  }

  if (phase === "expired") {
    return {
      kind: "expired",
      roundId: round.roundId,
      tape,
      reducedMotion,
      retry,
    };
  }

  const _exhaustive: never = phase;
  return _exhaustive;
}
