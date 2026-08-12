/**
 * Single source for per-phase player-facing copy, shared by the CurrentRound
 * rail and the Round Theater. Uses CONTEXT.md vocabulary exactly:
 * Crash Point, Replay, Tier, Margin, Ticket, Arcade Leverage, Epoch.
 */

import type { CrashRoundPhase } from "./margin-call-crash";
import type {
  RoundTimeline,
  RoundTimelineCountdown,
  RoundTimelineSegmentId,
} from "./round-timeline";
import { formatCountdown } from "./utils";

export type RoundPhaseCopy = {
  /** Short chip label (was phaseLabels in current-round). */
  badge: string;
  title: string;
  body: string;
  /** Which timeline-strip segment this phase highlights. */
  timelineSegment: RoundTimelineSegmentId;
};

export const roundPhaseCopy: Record<CrashRoundPhase, RoundPhaseCopy> = {
  prelaunch: {
    badge: "Epoch pending",
    title: "Round opens soon",
    body: "This epoch has not started yet. Rounds run on a fixed onchain grid: a 45-second entry window opens every 60 seconds.",
    timelineSegment: "entry",
  },
  uninitialized: {
    badge: "Awaiting opener",
    title: "Awaiting opener",
    body: "This epoch exists on the grid but no round has been opened onchain yet. Entry begins once an opener pre-commits the encrypted Crash Point.",
    timelineSegment: "entry",
  },
  open: {
    badge: "Entry open",
    title: "Entry open",
    body: "Commit Margin at an Arcade Leverage Tier before entry locks. Higher Tiers reserve bigger payouts and survive fewer Crash Points.",
    timelineSegment: "entry",
  },
  locked: {
    badge: "Entry locked",
    title: "Awaiting reveal request",
    body: "Entry is locked. The encrypted handle stays confidential until a permissionless reveal marks it for public attestation.",
    timelineSegment: "locked",
  },
  "reveal-requested": {
    badge: "Awaiting attestation",
    title: "Awaiting attestation",
    body: "Reveal has been requested. No Crash Point is shown until covalidator signatures finalize the exact stored handle.",
    timelineSegment: "reveal",
  },
  "expired-eligible": {
    badge: "Past expiry",
    title: "Past expiry",
    body: "This round can be marked expired. No Crash Point will be invented; original margin becomes refundable after expiry is recorded.",
    timelineSegment: "reveal",
  },
  finalized: {
    badge: "Finalized",
    title: "Finalized",
    body: "The attested Crash Point is on the floor chart. Claim or settle from your ticket below.",
    timelineSegment: "result",
  },
  expired: {
    badge: "Expired",
    title: "Outcome unavailable",
    body: "This round expired without a verified Crash Point. Ticket owners can pull back exactly their original margin.",
    timelineSegment: "reveal",
  },
};

/** Countdown phrases shared by the theater strip, OpenStage, handoff, and rail. */
export const countdownCopy = {
  entryClosesIn: "Entry closes in",
  nextRoundOpensIn: "Next round opens in",
  nextRoundOpening: "Next round opening…",
  nextRoundOpensNamed: (roundId: string, clock: string) =>
    `Next round ${roundId} opens in ${clock}`,
  nextRoundOpeningNamed: (roundId: string) => `Next round ${roundId} opening…`,
  nextRoundEntryOpen: (roundId: string, clock: string) =>
    `Round ${roundId} entry is open — closes in ${clock}`,
  entriesReopen: (clock: string, roundId: string) =>
    `Entries reopen in ${clock} · Round ${roundId}`,
  entriesOpening: (roundId: string) => `Round ${roundId} opening…`,
} as const;

/** Full strip sentence for the active timeline countdown. */
export function formatTimelineCountdown(timeline: RoundTimeline): string {
  const { countdown } = timeline;
  if (countdown.kind === "entry-closes") {
    return `${countdownCopy.entryClosesIn} ${formatCountdown(countdown.seconds)}`;
  }
  return countdown.seconds > 0
    ? `${countdownCopy.nextRoundOpensIn} ${formatCountdown(countdown.seconds)}`
    : countdownCopy.nextRoundOpening;
}

/** Prefix above OpenStage's giant clock — same phrases as the strip, no time. */
export function formatTimelineCountdownLabel(timeline: RoundTimeline): string {
  return timeline.countdown.kind === "entry-closes"
    ? countdownCopy.entryClosesIn
    : countdownCopy.nextRoundOpensIn;
}

/** Result handoff line; names the upcoming round because the caption is the result. */
export function formatNextRoundHandoff(next: {
  roundId: bigint;
  countdown: RoundTimelineCountdown;
}): string {
  const roundId = next.roundId.toString();
  if (next.countdown.kind === "entry-closes") {
    return countdownCopy.nextRoundEntryOpen(
      roundId,
      formatCountdown(next.countdown.seconds)
    );
  }
  return next.countdown.seconds > 0
    ? countdownCopy.nextRoundOpensNamed(
        roundId,
        formatCountdown(next.countdown.seconds)
      )
    : countdownCopy.nextRoundOpeningNamed(roundId);
}

/**
 * Rail post-lock notice. Uses `countdown.seconds` only when kind is
 * `next-opens`; otherwise treats the next epoch as due.
 */
export function formatEntriesReopenNotice(timeline: RoundTimeline): string {
  const nextRoundId = (timeline.roundId + 1n).toString();
  const seconds =
    timeline.countdown.kind === "next-opens" ? timeline.countdown.seconds : 0;
  return seconds > 0
    ? countdownCopy.entriesReopen(formatCountdown(seconds), nextRoundId)
    : countdownCopy.entriesOpening(nextRoundId);
}
