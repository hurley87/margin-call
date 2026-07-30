/**
 * Pure helpers for Pool Statistics (NAV distribution + formatting).
 * NAV / prices from RipEngine are WAD USD ($1 = 1e18).
 */

export const WAD = 10n ** 18n;

/** Histogram bucket edges in whole USD (inclusive lower, exclusive upper except last). */
export const DEFAULT_NAV_BUCKETS_USD = [
  0, 25, 50, 100, 150, 200, 300, 500,
] as const;

export type NavBucket = {
  /** Lower bound in USD (inclusive). */
  minUsd: number;
  /** Upper bound in USD (exclusive), or null for open-ended. */
  maxUsd: number | null;
  count: number;
};

/** Convert a WAD integer string to a dollar float (safe for band-sized NAVs). */
export function wadToUsdNumber(wad: string | bigint): number {
  const value = typeof wad === "bigint" ? wad : BigInt(wad);
  const cents = value / 10n ** 16n;
  return Number(cents) / 100;
}

/** Format WAD USD as `$xx.xx`. */
export function formatWadUsd(wad: string | bigint): string {
  const value = typeof wad === "bigint" ? wad : BigInt(wad);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / WAD;
  const frac = abs % WAD;
  const cents = (frac * 100n) / WAD;
  const centsStr = cents.toString().padStart(2, "0");
  return `${negative ? "-" : ""}$${whole.toString()}.${centsStr}`;
}

/** Build a NAV distribution histogram from WAD NAV values. */
export function buildNavDistribution(
  navsWad: readonly (string | bigint)[],
  edgesUsd: readonly number[] = DEFAULT_NAV_BUCKETS_USD
): NavBucket[] {
  const buckets: NavBucket[] = [];
  for (let i = 0; i < edgesUsd.length; i++) {
    const minUsd = edgesUsd[i]!;
    const maxUsd = i + 1 < edgesUsd.length ? edgesUsd[i + 1]! : null;
    buckets.push({ minUsd, maxUsd, count: 0 });
  }

  for (const nav of navsWad) {
    const usd = wadToUsdNumber(nav);
    let placed = false;
    for (const bucket of buckets) {
      const underMax = bucket.maxUsd === null || usd < bucket.maxUsd;
      if (usd >= bucket.minUsd && underMax) {
        bucket.count += 1;
        placed = true;
        break;
      }
    }
    if (!placed && buckets.length > 0) {
      buckets[buckets.length - 1]!.count += 1;
    }
  }

  return buckets;
}

/**
 * Harmonic mean of WAD NAVs (returns WAD string). Empty → "0".
 * Mirrors RipMath.harmonicMean (invSum += WAD²/nav, hm = n·WAD²/invSum).
 */
export function harmonicMeanWad(navsWad: readonly (string | bigint)[]): string {
  if (navsWad.length === 0) return "0";
  let invSum = 0n;
  for (const nav of navsWad) {
    const n = typeof nav === "bigint" ? nav : BigInt(nav);
    if (n <= 0n) return "0";
    invSum += (WAD * WAD) / n;
  }
  const count = BigInt(navsWad.length);
  return ((count * WAD * WAD) / invSum).toString();
}

/** unitPriceWad = hm * (WAD + surcharge) / WAD */
export function unitPriceFromHm(
  hmWad: string | bigint,
  surchargeWad: string | bigint
): string {
  const hm = typeof hmWad === "bigint" ? hmWad : BigInt(hmWad);
  const surcharge =
    typeof surchargeWad === "bigint" ? surchargeWad : BigInt(surchargeWad);
  return ((hm * (WAD + surcharge)) / WAD).toString();
}
