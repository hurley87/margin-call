/**
 * Convex-side Starter Grant config (mirrors src/lib/grants/starter-grant-policy).
 * Kept local so Convex actions do not import from src/.
 */

export const MOCK_USD_DECIMALS = 6;
export const MOCK_USD_UNIT = 1_000_000;

export const STARTER_GRANT_CONFIG = {
  version: 1,
  grantAmount: 50 * MOCK_USD_UNIT,
  refillAmount: 50 * MOCK_USD_UNIT,
  refillCooldownMs: 24 * 60 * 60 * 1000,
} as const;
