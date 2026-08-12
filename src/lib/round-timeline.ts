/**
 * Deterministic round-timeline model for the visible lifecycle strip.
 *
 * Every value derives from the immutable epoch grid already on the round
 * struct (openAt / lockAt / expiresAt) plus corrected chain time — no reads.
 */

import {
  deriveRoundPhase,
  type CrashRound,
  type CrashRoundPhase,
} from "./margin-call-crash";

/** Epoch grid spacing: a new round opens every 60 seconds (immutable onchain). */
export const ROUND_INTERVAL_SECONDS = 60n;

export type RoundTimelineSegmentId =
  "entry" | "locked" | "reveal" | "result" | "next";

export type RoundTimelineSegmentState =
  "done" | "active" | "upcoming" | "skipped";

export type RoundTimelineSegment = {
  id: RoundTimelineSegmentId;
  state: RoundTimelineSegmentState;
  /** 0..1 fill; null = active but event-driven (no deterministic end). */
  progress: number | null;
};

export type RoundTimelineCountdown = {
  kind: "entry-closes" | "next-opens";
  seconds: number;
};

export type RoundTimeline = {
  roundId: bigint;
  phase: CrashRoundPhase;
  /** Always the five segment ids, in lifecycle order. */
  segments: RoundTimelineSegment[];
  /** Headline countdown for the active moment; never negative. */
  countdown: RoundTimelineCountdown;
  /** Grid-derived, clamped ≥ 0; 0 means the next epoch is due ("opening…"). */
  nextRoundOpensInSeconds: number;
  /** Seconds until the round can be marked expired; null once past or moot. */
  expiresInSeconds: number | null;
};

function clampSeconds(value: bigint): number {
  return value > 0n ? Number(value) : 0;
}

function clampProgress(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function segment(
  id: RoundTimelineSegmentId,
  state: RoundTimelineSegmentState,
  progress: number | null = null
): RoundTimelineSegment {
  return { id, state, progress };
}

export function getRoundTimeline(
  round: CrashRound,
  chainTimestamp: bigint
): RoundTimeline {
  const phase = deriveRoundPhase(round, chainTimestamp);
  const nextOpensAt = round.openAt + ROUND_INTERVAL_SECONDS;
  const nextRoundOpensInSeconds = clampSeconds(nextOpensAt - chainTimestamp);
  const entryClosesInSeconds = clampSeconds(round.lockAt - chainTimestamp);
  const expiresInSeconds = clampSeconds(round.expiresAt - chainTimestamp);

  const entryProgress = clampProgress(
    Number(chainTimestamp - round.openAt) / Number(round.lockAt - round.openAt)
  );
  const nextProgress = clampProgress(
    Number(chainTimestamp - round.openAt) / Number(ROUND_INTERVAL_SECONDS)
  );

  const nextOpensCountdown: RoundTimelineCountdown = {
    kind: "next-opens",
    seconds: nextRoundOpensInSeconds,
  };

  switch (phase) {
    case "prelaunch":
    case "uninitialized":
    case "open": {
      // A stale uninitialized epoch past its lock can no longer accept entry;
      // the only deterministic thing left is the next epoch boundary.
      const pastLock = chainTimestamp >= round.lockAt;
      return {
        roundId: round.id,
        phase,
        segments: [
          segment("entry", "active", entryProgress),
          segment("locked", "upcoming"),
          segment("reveal", "upcoming"),
          segment("result", "upcoming"),
          segment("next", "upcoming"),
        ],
        countdown: pastLock
          ? nextOpensCountdown
          : { kind: "entry-closes", seconds: entryClosesInSeconds },
        nextRoundOpensInSeconds,
        expiresInSeconds: null,
      };
    }
    case "locked":
      return {
        roundId: round.id,
        phase,
        segments: [
          segment("entry", "done", 1),
          segment("locked", "active"),
          segment("reveal", "upcoming"),
          segment("result", "upcoming"),
          segment("next", "upcoming"),
        ],
        countdown: nextOpensCountdown,
        nextRoundOpensInSeconds,
        expiresInSeconds,
      };
    case "reveal-requested":
      return {
        roundId: round.id,
        phase,
        segments: [
          segment("entry", "done", 1),
          segment("locked", "done"),
          segment("reveal", "active"),
          segment("result", "upcoming"),
          segment("next", "upcoming"),
        ],
        countdown: nextOpensCountdown,
        nextRoundOpensInSeconds,
        expiresInSeconds,
      };
    case "finalized":
      return {
        roundId: round.id,
        phase,
        segments: [
          segment("entry", "done", 1),
          segment("locked", "done"),
          segment("reveal", "done"),
          segment("result", "done"),
          segment("next", "active", nextProgress),
        ],
        countdown: nextOpensCountdown,
        nextRoundOpensInSeconds,
        expiresInSeconds: null,
      };
    case "expired-eligible":
    case "expired":
      return {
        roundId: round.id,
        phase,
        segments: [
          segment("entry", "done", 1),
          segment("locked", "done"),
          segment("reveal", "skipped"),
          segment("result", "skipped"),
          segment("next", "active", nextProgress),
        ],
        countdown: nextOpensCountdown,
        nextRoundOpensInSeconds,
        expiresInSeconds:
          phase === "expired-eligible" ? expiresInSeconds : null,
      };
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}
