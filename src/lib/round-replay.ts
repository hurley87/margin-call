/**
 * Deterministic round-theater replay math.
 *
 * The climb is a pure function of the attested Crash Point and elapsed time.
 * Mid-arrival clients seek to the correct frame; watching, skipping, or
 * replaying never gates or changes settlement.
 */

const ONE_X_BPS = 10_000n;
const MAX_CRASH_POINT_BPS = 100_000n;

/** Minimum dramatized climb duration (at a 1.00x Crash Point). */
export const REPLAY_DURATION_MIN_MS = 4_000;
/** Maximum dramatized climb duration (at a 10.00x Crash Point). */
export const REPLAY_DURATION_MAX_MS = 12_000;

/** Number of polyline samples used to build the SVG path. */
const PATH_SAMPLES = 64;

/**
 * Clamps a raw Crash Point into the displayable range [1.00x, 10.00x].
 * Sub-1.00x values (e.g. r=0 → 0.99x) floor to 1.00x, matching formatCrashPointBps.
 */
export function clampCrashPointBps(crashPointBps: bigint): bigint {
  if (crashPointBps < ONE_X_BPS) return ONE_X_BPS;
  if (crashPointBps > MAX_CRASH_POINT_BPS) return MAX_CRASH_POINT_BPS;
  return crashPointBps;
}

/**
 * 4s at 1.00x to 12s at 10.00x, log-scaled so perceived growth rate is constant.
 */
export function getReplayDurationMs(crashPointBps: bigint): number {
  const crash = clampCrashPointBps(crashPointBps);
  if (crash <= ONE_X_BPS) return REPLAY_DURATION_MIN_MS;

  const crashX = Number(crash) / Number(ONE_X_BPS);
  const t = Math.log(crashX) / Math.log(10);
  return Math.round(
    REPLAY_DURATION_MIN_MS +
      t * (REPLAY_DURATION_MAX_MS - REPLAY_DURATION_MIN_MS)
  );
}

/**
 * Progress in [0, 1] from elapsed wall time. Clamps past the duration so a
 * mid-arrival client that joins after the climb finished lands on the final frame.
 */
export function getReplayProgress(
  elapsedMs: number,
  crashPointBps: bigint
): number {
  if (elapsedMs <= 0) return 0;
  const duration = getReplayDurationMs(crashPointBps);
  if (duration <= 0) return 1;
  return Math.min(1, elapsedMs / duration);
}

/**
 * Multiplier at progress p: m(p) = crash^p.
 * Exact 1.00x at p=0 and exact crash at p=1.
 */
export function getReplayMultiplierBps(
  progress: number,
  crashPointBps: bigint
): bigint {
  const crash = clampCrashPointBps(crashPointBps);
  if (progress <= 0) return ONE_X_BPS;
  if (progress >= 1) return crash;

  const crashX = Number(crash) / Number(ONE_X_BPS);
  const multiplier = Math.pow(crashX, progress);
  return BigInt(Math.round(multiplier * Number(ONE_X_BPS)));
}

/**
 * Progress at which a tier closes: p = log_crash(tier).
 * Returns null when the tier never closes (tier above the Crash Point).
 * Equality wins: a tier exactly at the Crash Point closes at p = 1.
 */
export function getTierCloseProgress(
  tierBps: bigint,
  crashPointBps: bigint
): number | null {
  const crash = clampCrashPointBps(crashPointBps);
  if (tierBps > crash) return null;
  if (tierBps <= ONE_X_BPS) return 0;
  if (tierBps === crash) return 1;
  if (crash <= ONE_X_BPS) return null;

  const crashX = Number(crash) / Number(ONE_X_BPS);
  const tierX = Number(tierBps) / Number(ONE_X_BPS);
  return Math.log(tierX) / Math.log(crashX);
}

export type ReplayPathPoint = { x: number; y: number };

/**
 * Builds an SVG path string for the climb up to `progress`.
 * Coordinates are normalized to a 0–100 viewBox (x = time, y = multiplier
 * inverted so higher multipliers sit higher on screen).
 */
export function getReplayPath(
  crashPointBps: bigint,
  progress: number,
  options: { width?: number; height?: number; samples?: number } = {}
): string {
  const width = options.width ?? 100;
  const height = options.height ?? 100;
  const samples = options.samples ?? PATH_SAMPLES;
  const points = getReplayPathPoints(crashPointBps, progress, {
    width,
    height,
    samples,
  });
  if (points.length === 0) return "";

  const [first, ...rest] = points;
  let d = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
  for (const point of rest) {
    d += ` L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }
  return d;
}

/** Sampled polyline points for the climb up to `progress`. */
export function getReplayPathPoints(
  crashPointBps: bigint,
  progress: number,
  options: { width?: number; height?: number; samples?: number } = {}
): ReplayPathPoint[] {
  const width = options.width ?? 100;
  const height = options.height ?? 100;
  const samples = Math.max(2, options.samples ?? PATH_SAMPLES);
  const crash = clampCrashPointBps(crashPointBps);
  const crashX = Number(crash) / Number(ONE_X_BPS);
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const count = Math.max(
    2,
    Math.ceil(samples * Math.max(clampedProgress, 0.001))
  );

  const points: ReplayPathPoint[] = [];
  for (let i = 0; i < count; i++) {
    const p = (i / (count - 1)) * clampedProgress;
    const multiplier = p <= 0 ? 1 : p >= 1 ? crashX : Math.pow(crashX, p);
    const x = p * width;
    // Invert y so 1.00x sits at the bottom and crash sits near the top,
    // with headroom so the head never kisses the viewBox edge.
    const yMax = crashX * 1.08;
    const y = height - ((multiplier - 1) / (yMax - 1)) * height;
    points.push({ x, y });
  }
  return points;
}

/** True when progress has reached the hard stop. */
export function isReplayComplete(progress: number): boolean {
  return progress >= 1;
}

/** Tiers that have closed at or before the given progress. */
export function getClosedTiersAtProgress(
  progress: number,
  crashPointBps: bigint,
  tiers: readonly bigint[]
): bigint[] {
  return tiers.filter((tier) => {
    const closeAt = getTierCloseProgress(tier, crashPointBps);
    return closeAt !== null && closeAt <= progress;
  });
}
