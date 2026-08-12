/**
 * Round-theater copy. Uses CONTEXT.md vocabulary exactly:
 * Crash Point, Replay, Tier, Margin, Ticket, Arcade Leverage.
 */

import { countdownCopy } from "@/lib/round-phase-copy";

export const theaterCopy = {
  heading: "Round theater",
  replayLabel: "Replay of an attested onchain result",
  replayDetail:
    "This climb is a dramatized rendering of the verified Crash Point. Watching, skipping, or replaying never changes settlement.",
  expired: "Outcome unavailable",
  expiredDetail:
    "This round expired without a verified Crash Point. Ticket owners can pull back exactly their original margin.",
  openCountdown: countdownCopy.entryClosesIn,
  openTape: "Live ticket tape",
  openAmbiance: (roundId: string) => `Round ${roundId} replay`,
  openAmbianceLabel: "Previous round replay",
  openAmbianceNote: "Previous result — not the live round.",
  openAmbianceEmpty: "No prior finalized round to replay yet.",
  resultCaption: (roundId: string) => `Round ${roundId} result`,
  nextRoundOpens: countdownCopy.nextRoundOpensNamed,
  nextRoundOpening: countdownCopy.nextRoundOpeningNamed,
  nextRoundEntryOpen: countdownCopy.nextRoundEntryOpen,
  verifiedCrashPoint: "Verified Crash Point",
  /** Eyebrow above a personal Won / Margin called freeze. */
  yourTicket: "Your Ticket",
  /** Supporting line under a personal outcome freeze: `Crash Point 2.50x`. */
  crashPointSupporting: (crashPoint: string) => `Crash Point ${crashPoint}`,
  /** Signed-in player landed: Ticket closed at or below the Crash Point. */
  playerWon: "Won",
  playerWonDetail:
    "Your Arcade Leverage closed at or below the verified Crash Point.",
  /** Signed-in player landed: Ticket still open when the market died. */
  playerMarginCalled: "Margin called",
  playerMarginCalledDetail: "The Crash Point died below your Arcade Leverage.",
  marginCall: "Margin call",
  marginCallDetail:
    "Hard stop — every Ticket still open takes the margin call.",
  tierClosed: (tier: string) => `Closed ${tier} — paid`,
  tierOpen: (tier: string) => `${tier} — margin call`,
  tierIdle: (tier: string) => `${tier} — waiting`,
  noTicketsAtTier: "No Tickets",
  replayAgain: "Replay",
  soundOn: "Sound on",
  soundOff: "Sound off",
  soundHint: "Audio is optional and muted by default.",
  soundAvailable: "Terminal audio available",
  viewFinalization: "View finalization transaction",
  loading: "Loading round theater…",
  staticResult: "Static result card",
} as const;
