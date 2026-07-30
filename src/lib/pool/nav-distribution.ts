/**
 * Pure helpers for Pool Statistics (NAV distribution + formatting).
 * Source of truth: `@margin-call/shared`.
 */
export {
  WAD,
  DEFAULT_NAV_BUCKETS_USD,
  wadToUsdNumber,
  formatWadUsd,
  buildNavDistribution,
  harmonicMeanWad,
  unitPriceFromHm,
  type NavBucket,
} from "@margin-call/shared";
