/**
 * Motion design tokens — single source of truth for the UI's feel.
 * The CSS variable block in src/app/globals.css (`MOTION TOKENS`) mirrors
 * these values for keyframe/utility consumption; keep the two in sync.
 */

/** Durations in ms. Frequent animations stay ≤ `slow`; ceremonies are rare. */
export const DUR = {
  /** Button presses, hover feedback. */
  fast: 120,
  /** Standard transitions. */
  base: 200,
  /** Upper bound for frequent animations (feed arrival, FLIP). */
  slow: 300,
  /** AnimatedNumber odometer roll. */
  number: 450,
  /** Gain/loss flash on a value change. */
  flash: 600,
  /** Suspense beat before a high-stakes reveal. */
  suspense: 550,
  /** Total length of a win/wipeout ceremony. */
  ceremony: 1900,
  /** How long a ceremony holds on screen when motion is reduced. */
  ceremonyReduced: 1500,
} as const;

export const EASE = {
  /** Snappy press/settle. */
  snap: "cubic-bezier(0.2, 0.9, 0.3, 1)",
  /** Smooth deceleration for slides and FLIP moves. */
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

/**
 * Minimum |P&L| for a win/loss to earn a full ceremony overlay.
 * Wipeouts always do. Keeps ceremonies rare on an active desk.
 */
export const BIG_MOVE_USDC = 100;

/** Delay between feed rows arriving in one burst. */
export const STAGGER_MS = 60;
/** Rows past this index share the max stagger delay (burst cap). */
export const STAGGER_CAP = 6;

/**
 * CSS `animation-delay` for a feed/wire row at `burstIndex` within an arrival
 * burst, capped at `STAGGER_CAP` so large bursts don't trail off forever.
 */
export function staggerDelay(burstIndex: number): string {
  return `calc(var(--mc-stagger) * ${Math.min(burstIndex, STAGGER_CAP)})`;
}

/** Bottom ticker-tape marquee scroll speed. */
export const MARQUEE = {
  /** Minimum loop duration so a near-empty tape still scrolls gently. */
  minSeconds: 30,
  /** Added per tape entry so a fuller tape scrolls proportionally slower. */
  perItemSeconds: 4,
} as const;

/** Procedural SFX gain levels (0–1), all routed through the master gain. */
export const SFX_VOLUME = {
  master: 0.7,
  tick: 0.02,
  ping: 0.05,
  win: 0.06,
  loss: 0.06,
  stinger: 0.08,
} as const;
