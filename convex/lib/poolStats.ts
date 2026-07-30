/**
 * Convex-local pool stat helpers (mirrors src/lib/pool/nav-distribution.ts).
 */

export const WAD = 10n ** 18n;

export const DEFAULT_NAV_BUCKETS_USD = [
  0, 25, 50, 100, 150, 200, 300, 500,
] as const;

export type NavBucket = {
  minUsd: number;
  maxUsd: number | null;
  count: number;
};

export function wadToUsdNumber(wad: string | bigint): number {
  const value = typeof wad === "bigint" ? wad : BigInt(wad);
  const cents = value / 10n ** 16n;
  return Number(cents) / 100;
}

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

export function unitPriceFromHm(
  hmWad: string | bigint,
  surchargeWad: string | bigint
): string {
  const hm = typeof hmWad === "bigint" ? hmWad : BigInt(hmWad);
  const surcharge =
    typeof surchargeWad === "bigint" ? surchargeWad : BigInt(surchargeWad);
  return ((hm * (WAD + surcharge)) / WAD).toString();
}
