/**
 * Arc lifecycle constants + deterministic helpers — pure, no Convex imports.
 *
 * The wire engine advances arcs through this pipeline by code (never the LLM):
 *   rumor → denial → confirmation → escalation → climax (once) → aftermath → retired
 *
 * `tensionScore`, firm `runningLossUsdc`, mood, and SEC heat are all derived
 * from these constants so totals stay monotonic and reproducible across runs.
 */

export const ARC_STAGES = [
  "rumor",
  "denial",
  "confirmation",
  "escalation",
  "climax",
  "aftermath",
  "retired",
] as const;

export type ArcStage = (typeof ARC_STAGES)[number];

/** Live (non-retired) stages, in order. */
export const LIVE_STAGES: ArcStage[] = [
  "rumor",
  "denial",
  "confirmation",
  "escalation",
  "climax",
  "aftermath",
];

/** Target tension each stage settles at (code sets tensionScore to this ±jitter). */
export const STAGE_TARGET_TENSION: Record<ArcStage, number> = {
  rumor: 3,
  denial: 4,
  confirmation: 6,
  escalation: 8,
  climax: 10,
  aftermath: 3,
  retired: 0,
};

/** Beats that must publish in a stage before the arc may advance. */
export const STAGE_BEAT_QUOTA: Record<ArcStage, number> = {
  rumor: 2,
  denial: 1,
  confirmation: 1,
  escalation: 2,
  climax: 1,
  aftermath: 2,
  retired: 0,
};

/** Next stage in the pipeline (retired is terminal). */
export function nextStage(stage: ArcStage): ArcStage {
  const idx = ARC_STAGES.indexOf(stage);
  if (idx < 0 || stage === "retired") return "retired";
  return ARC_STAGES[idx + 1] ?? "retired";
}

/**
 * Per-stage fraction of a firm's peak loss. Monotonic up to climax, frozen
 * after — so a firm's running loss total never decreases (acceptance: totals
 * are monotonic and consistent across runs).
 */
export const LOSS_BAND_FRACTIONS: Record<ArcStage, number> = {
  rumor: 0,
  denial: 0.1,
  confirmation: 0.3,
  escalation: 0.64,
  climax: 1,
  aftermath: 1,
  retired: 1,
};

/** Default peak loss for hand-seeded arcs with no spawn template. */
export const DEFAULT_PEAK_LOSS_USDC = 500_000_000;

/** Target running-loss total (USDC) a firm reaches at a given stage. */
export function targetLossUsdc(peakUsdc: number, stage: ArcStage): number {
  return Math.round(peakUsdc * LOSS_BAND_FRACTIONS[stage]);
}

/** Deterministic per-firm peak so totals vary firm-to-firm but stay stable. */
export function peakLossForFirm(
  firmSlug: string,
  basePeakUsdc: number
): number {
  const scalePct = 85 + seededInt(`peak:${firmSlug}`, 0, 30); // 0.85–1.15×
  return Math.round((basePeakUsdc * scalePct) / 100);
}

/** Firm health derived purely from its arc's stage. */
export function firmStatusForStage(
  stage: ArcStage
): "healthy" | "stressed" | "collapsing" | "dead" {
  switch (stage) {
    case "rumor":
    case "denial":
      return "healthy";
    case "confirmation":
      return "stressed";
    case "escalation":
    case "climax":
      return "collapsing";
    case "aftermath":
    case "retired":
      return "dead";
  }
}

/**
 * Deterministic 32-bit hash (FNV-1a). Used to seed loss figures, jitter, and
 * gossip truth so a given (slug, stage, slot) always yields the same number —
 * reproducible and replay-safe, since Math.random() is unavailable in Convex
 * actions and would break the "code owns the numbers" guarantee.
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
