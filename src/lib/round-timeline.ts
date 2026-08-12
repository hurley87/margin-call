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

const SEGMENT_IDS = ["entry", "locked", "reveal", "result", "next"] as const;

export type RoundTimelineSegmentId = (typeof SEGMENT_IDS)[number];

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

type TimelinePhaseLayout = {
  active: RoundTimelineSegmentId;
  skipped: readonly RoundTimelineSegmentId[];
  clocks: {
    countdown: RoundTimelineCountdown["kind"];
    expiresInSeconds: boolean;
  };
};

const PHASE_TIMELINE: Record<CrashRoundPhase, TimelinePhaseLayout> = {
  prelaunch: {
    active: "entry",
    skipped: [],
    clocks: { countdown: "entry-closes", expiresInSeconds: false },
  },
  uninitialized: {
    active: "entry",
    skipped: [],
    clocks: { countdown: "entry-closes", expiresInSeconds: false },
  },
  open: {
    active: "entry",
    skipped: [],
    clocks: { countdown: "entry-closes", expiresInSeconds: false },
  },
  locked: {
    active: "locked",
    skipped: [],
    clocks: { countdown: "next-opens", expiresInSeconds: true },
  },
  "reveal-requested": {
    active: "reveal",
    skipped: [],
    clocks: { countdown: "next-opens", expiresInSeconds: true },
  },
  finalized: {
    active: "next",
    skipped: [],
    clocks: { countdown: "next-opens", expiresInSeconds: false },
  },
  "expired-eligible": {
    active: "next",
    skipped: ["reveal", "result"],
    clocks: { countdown: "next-opens", expiresInSeconds: true },
  },
  expired: {
    active: "next",
    skipped: ["reveal", "result"],
    clocks: { countdown: "next-opens", expiresInSeconds: false },
  },
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

function activeProgress(
  id: RoundTimelineSegmentId,
  entryProgress: number,
  nextProgress: number
): number | null {
  if (id === "entry") return entryProgress;
  if (id === "next") return nextProgress;
  return null;
}

function mapTimelineSegments(
  layout: TimelinePhaseLayout,
  entryProgress: number,
  nextProgress: number
): RoundTimelineSegment[] {
  const activeIndex = SEGMENT_IDS.indexOf(layout.active);
  const skipped = new Set(layout.skipped);

  return SEGMENT_IDS.map((id, index) => {
    if (skipped.has(id)) return segment(id, "skipped");
    if (id === layout.active) {
      return segment(
        id,
        "active",
        activeProgress(id, entryProgress, nextProgress)
      );
    }
    if (index < activeIndex) {
      return segment(id, "done", id === "entry" ? 1 : null);
    }
    return segment(id, "upcoming");
  });
}

export function getRoundTimeline(
  round: CrashRound,
  chainTimestamp: bigint
): RoundTimeline {
  const phase = deriveRoundPhase(round, chainTimestamp);
  const layout = PHASE_TIMELINE[phase];
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

  // A stale uninitialized epoch past its lock can no longer accept entry;
  // the only deterministic thing left is the next epoch boundary.
  const pastLock = chainTimestamp >= round.lockAt;
  const countdown: RoundTimelineCountdown =
    layout.clocks.countdown === "entry-closes" && !pastLock
      ? { kind: "entry-closes", seconds: entryClosesInSeconds }
      : nextOpensCountdown;

  return {
    roundId: round.id,
    phase,
    segments: mapTimelineSegments(layout, entryProgress, nextProgress),
    countdown,
    nextRoundOpensInSeconds,
    expiresInSeconds: layout.clocks.expiresInSeconds ? expiresInSeconds : null,
  };
}
