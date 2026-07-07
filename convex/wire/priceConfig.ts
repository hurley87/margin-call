/**
 * Price / movement thresholds — pure config, no logic. These live here (not
 * inlined in the engine) so the wire's sensitivity can be retuned without
 * touching code. All percentages are absolute price moves in percent.
 *
 * How a move is classified (see tokenSignals.ts):
 *   |move| >= flashPct    → flash bulletin (a threshold event)
 *   |move| >= storyPct    → a story (spawns/advances an attention arc)
 *   |move| >= routinePct  → routine mention on the tape
 *   otherwise             → not worth a line
 * A multi-day streak of STREAK_MIN_DAYS or more is always at least a story.
 */

export const MOVE_THRESHOLDS = {
  /** Worth a one-line mention on the tape. */
  routinePct: 5,
  /** Worth its own story; spawns or advances an attention arc. */
  storyPct: 12,
  /** Fires a flash bulletin. */
  flashPct: 20,
} as const;

/** 24h volume this many times the trailing daily average = a volume anomaly. */
export const VOLUME_ANOMALY_MULTIPLE = 3;

/** Consecutive same-direction days that count as a streak ("third straight red day"). */
export const STREAK_MIN_DAYS = 3;

/** Days of daily-close history used for the trailing volume average + streaks. */
export const TRAILING_VOLUME_DAYS = 7;

/** Spacing between per-token CoinGecko fetches (ms), to respect Demo rate limits. */
export const POLL_SPACING_MS = 300;

/** Max snapshots read per token per signal computation (~7.5 days hourly). */
export const SIGNAL_SNAPSHOT_LOOKBACK = 200;
