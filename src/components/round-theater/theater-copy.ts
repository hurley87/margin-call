/**
 * Round-theater copy. Uses CONTEXT.md vocabulary exactly:
 * Crash Point, Replay, Tier, Margin, Ticket, Arcade Leverage.
 */

export const theaterCopy = {
  heading: "Round theater",
  replayLabel: "Replay of an attested onchain result",
  replayDetail:
    "This climb is a dramatized rendering of the verified Crash Point. Watching, skipping, or replaying never changes settlement.",
  awaitingAttestation: "Awaiting attestation",
  awaitingAttestationDetail:
    "Reveal has been requested. No Crash Point is shown and no climb plays until covalidator signatures finalize the exact stored handle.",
  awaitingReveal: "Awaiting reveal request",
  awaitingRevealDetail:
    "Entry is locked. The encrypted handle stays confidential until a permissionless reveal marks it for public attestation.",
  pastExpiry: "Past expiry",
  pastExpiryDetail:
    "This round can be marked expired. No Crash Point will be invented; original margin becomes refundable after expiry is recorded.",
  expired: "Outcome unavailable",
  expiredDetail:
    "This round expired without a verified Crash Point. Ticket owners can pull back exactly their original margin.",
  openCountdown: "Entry closes in",
  openTape: "Live ticket tape",
  openAmbiance: "Previous round replay",
  openAmbianceEmpty: "No prior finalized round to replay yet.",
  verifiedCrashPoint: "Verified Crash Point",
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
  viewFinalization: "View finalization transaction",
  loading: "Loading round theater…",
  staticResult: "Static result card",
} as const;

export const delayedPhaseCopy = {
  locked: {
    title: theaterCopy.awaitingReveal,
    body: theaterCopy.awaitingRevealDetail,
  },
  "reveal-requested": {
    title: theaterCopy.awaitingAttestation,
    body: theaterCopy.awaitingAttestationDetail,
  },
  "expired-eligible": {
    title: theaterCopy.pastExpiry,
    body: theaterCopy.pastExpiryDetail,
  },
} as const satisfies Record<
  "locked" | "reveal-requested" | "expired-eligible",
  { title: string; body: string }
>;
