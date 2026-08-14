/**
 * Single source for per-phase player-facing copy, shared by the CurrentRound
 * rail and the Round Theater. Uses CONTEXT.md vocabulary exactly:
 * Crash Point, Replay, Tier, Margin, Ticket, Arcade Leverage, Epoch.
 */

import type { CrashRoundPhase } from "./margin-call-crash";
import type { RoundTimeline, RoundTimelineCountdown } from "./round-timeline";
import { formatCountdown } from "./utils";

export type RoundPhaseCopy = {
  /** Short chip label (was phaseLabels in current-round). */
  badge: string;
  title: string;
  body: string;
};

export const roundPhaseCopy: Record<CrashRoundPhase, RoundPhaseCopy> = {
  prelaunch: {
    badge: "Epoch pending",
    title: "Round opens soon",
    body: "This epoch has not started yet. Rounds run on a fixed onchain grid: a 45-second entry window opens every 60 seconds.",
  },
  uninitialized: {
    badge: "Awaiting opener",
    title: "Awaiting opener",
    body: "This epoch exists on the grid but no round has been opened onchain yet. Entry begins once an opener pre-commits the encrypted Crash Point.",
  },
  open: {
    badge: "Entry open",
    title: "Entry open",
    body: "Commit Margin at an Arcade Leverage Tier before entry locks. Higher Tiers reserve bigger payouts and survive fewer Crash Points.",
  },
  locked: {
    badge: "Entry locked",
    title: "Awaiting reveal request",
    body: "Entry is locked. The encrypted handle stays confidential until a permissionless reveal marks it for public attestation.",
  },
  "reveal-requested": {
    badge: "Awaiting attestation",
    title: "Awaiting attestation",
    body: "Reveal has been requested. No Crash Point is shown until covalidator signatures finalize the exact stored handle.",
  },
  "expired-eligible": {
    badge: "Past expiry",
    title: "Past expiry",
    body: "This round can be marked expired. No Crash Point will be invented; original margin becomes refundable after expiry is recorded.",
  },
  finalized: {
    badge: "Finalized",
    title: "Finalized",
    body: "The attested Crash Point is on the floor chart. Claim or settle from your ticket below.",
  },
  expired: {
    badge: "Expired",
    title: "Outcome unavailable",
    body: "This round expired without a verified Crash Point. Ticket owners can pull back exactly their original margin.",
  },
};

/** Countdown phrases shared by the theater strip, OpenStage, handoff, and rail. */
export const countdownCopy = {
  entryClosesIn: "Entry closes in",
  nextRoundOpensIn: "Next round opens in",
  nextRoundOpening: "Next round opening…",
  entryOpensIn: "Entry opens in",
  entryOpening: "Entry opening…",
  nextRoundEntryOpen: (clock: string) => `Entry is open — closes in ${clock}`,
  entriesReopen: (clock: string) => `Entries reopen in ${clock}`,
} as const;

/** Disabled CTA label while the player arms picks for the next entry window. */
export function formatArmedEntryCta(seconds: number): string {
  return seconds > 0
    ? `${countdownCopy.entryOpensIn} ${formatCountdown(seconds)}`
    : countdownCopy.entryOpening;
}

/**
 * Plain-language dock copy while entry is closed. Uses CONTEXT.md vocabulary.
 */
export function armedEntryCopy(phase: CrashRoundPhase): string {
  switch (phase) {
    case "prelaunch":
      return "This epoch has not started yet. Pick your Margin and Arcade Leverage now — entry opens for 45 seconds every 60-second Epoch.";
    case "uninitialized":
      return "This epoch is on the grid but no round has been opened onchain yet. Pick your Margin and Arcade Leverage; entry unlocks once an opener pre-commits the encrypted Crash Point.";
    case "open":
      return "Entry cutoff — less than five seconds remain before onchain lock. Keep your Margin and Arcade Leverage ready for the next round.";
    case "locked":
      return "Entry for this round is closed. Pick your Margin and Arcade Leverage now and you are ready the moment the next window opens.";
    case "reveal-requested":
      return "Entry for this round is closed — the Crash Point is being attested onchain. Pick your Margin and Arcade Leverage now and you are ready the moment the next window opens.";
    case "finalized":
      return "This round is finalized. The Replay dramatizes the attested Crash Point. Pick your Margin and Arcade Leverage for the next entry window.";
    case "expired-eligible":
    case "expired":
      return "This round cannot finalize. Pick your Margin and Arcade Leverage for the next entry window once it opens.";
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

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

/** Result handoff line — stage-first; live chrome does not name round ids. */
export function formatNextRoundHandoff(
  countdown: RoundTimelineCountdown
): string {
  if (countdown.kind === "entry-closes") {
    return countdownCopy.nextRoundEntryOpen(formatCountdown(countdown.seconds));
  }
  return countdown.seconds > 0
    ? `${countdownCopy.nextRoundOpensIn} ${formatCountdown(countdown.seconds)}`
    : countdownCopy.nextRoundOpening;
}

/**
 * Rail post-lock notice. Uses `countdown.seconds` only when kind is
 * `next-opens`; otherwise treats the next epoch as due.
 */
export function formatEntriesReopenNotice(timeline: RoundTimeline): string {
  const seconds =
    timeline.countdown.kind === "next-opens" ? timeline.countdown.seconds : 0;
  return seconds > 0
    ? countdownCopy.entriesReopen(formatCountdown(seconds))
    : countdownCopy.nextRoundOpening;
}
