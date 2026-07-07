/**
 * Arc lifecycle constants + deterministic helpers — pure, no Convex imports.
 *
 * Arcs track ATTENTION, not fabricated losses. A company (or desk) on a
 * sustained move rises through these stages as the floor pays more attention,
 * then falls to aftermath/retired when the move cools:
 *
 *   noticed → talked_about → frenzy → peak (once) → aftermath → retired
 *
 * The stage and its tensionScore are DERIVED FROM REAL SIGNALS by code (see
 * worldState.ts); the LLM never picks a stage or a number. (Kept in sync with
 * the arcStageValidator in convex/schema.ts.)
 */

export const ARC_STAGES = [
  "noticed",
  "talked_about",
  "frenzy",
  "peak",
  "aftermath",
  "retired",
] as const;

export type ArcStage = (typeof ARC_STAGES)[number];

/** Live (non-retired) stages, in escalation order. */
export const LIVE_STAGES: ArcStage[] = [
  "noticed",
  "talked_about",
  "frenzy",
  "peak",
  "aftermath",
];

/** Tension each stage settles at (code sets tensionScore to this). */
export const STAGE_TARGET_TENSION: Record<ArcStage, number> = {
  noticed: 4,
  talked_about: 6,
  frenzy: 8,
  peak: 10,
  aftermath: 3,
  retired: 0,
};

/**
 * Deterministic 32-bit hash (FNV-1a). Seeds gossip truth, angle picks, and any
 * jitter so a given seed always yields the same value — reproducible and
 * replay-safe, since Math.random() is unavailable in Convex actions and would
 * break determinism.
 */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic float in [0, 1) from an arbitrary seed string. */
export function seededUnit(seed: string): number {
  return hashString(seed) / 0x100000000;
}

/** Deterministic integer in [min, max] inclusive. */
export function seededInt(seed: string, min: number, max: number): number {
  if (max <= min) return min;
  return min + (hashString(seed) % (max - min + 1));
}
