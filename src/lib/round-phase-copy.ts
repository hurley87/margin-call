/**
 * Single source for per-phase player-facing copy, shared by the CurrentRound
 * rail and the Round Theater. Uses CONTEXT.md vocabulary exactly:
 * Crash Point, Replay, Tier, Margin, Ticket, Arcade Leverage, Epoch.
 */

import type { CrashRoundPhase } from "./margin-call-crash";

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
