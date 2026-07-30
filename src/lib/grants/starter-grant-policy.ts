/**
 * Pure Starter Grant policy (one-time grant + rate-limited refill).
 * Amounts are MockUSD atomic units (6 decimals).
 */

export const MOCK_USD_DECIMALS = 6;
export const MOCK_USD_UNIT = 10 ** MOCK_USD_DECIMALS;

/** Versioned Starter Grant configuration. */
export type StarterGrantConfig = {
  version: number;
  /** One-time grant amount in MockUSD atomic units. */
  grantAmount: number;
  /** Refill amount in MockUSD atomic units. */
  refillAmount: number;
  /** Minimum ms between refills. */
  refillCooldownMs: number;
};

/** V1 defaults: $50 grant + $50 / 24h refill (prior art #278). */
export const STARTER_GRANT_CONFIG_V1: StarterGrantConfig = {
  version: 1,
  grantAmount: 50 * MOCK_USD_UNIT,
  refillAmount: 50 * MOCK_USD_UNIT,
  refillCooldownMs: 24 * 60 * 60 * 1000,
};

export type GrantRecord = {
  grantedAt: number;
  lastRefillAt: number | null;
  configVersion: number;
};

export type GrantDecision =
  | { kind: "grant"; amount: number; configVersion: number }
  | {
      kind: "refill";
      amount: number;
      configVersion: number;
      availableAt: number;
    }
  | { kind: "cooldown"; availableAt: number; configVersion: number }
  | { kind: "already_granted"; configVersion: number };

/** Decide whether a wallet may receive the one-time Starter Grant. */
export function decideStarterGrant(
  record: GrantRecord | null,
  config: StarterGrantConfig = STARTER_GRANT_CONFIG_V1
): GrantDecision {
  if (record) {
    return { kind: "already_granted", configVersion: config.version };
  }
  return {
    kind: "grant",
    amount: config.grantAmount,
    configVersion: config.version,
  };
}

/**
 * Decide whether a wallet may claim a refill.
 * Requires a prior one-time grant.
 */
export function decideRefill(
  record: GrantRecord | null,
  nowMs: number,
  config: StarterGrantConfig = STARTER_GRANT_CONFIG_V1
): GrantDecision {
  if (!record) {
    // No grant yet — surface as grant eligibility for callers that only expose refill.
    return decideStarterGrant(null, config);
  }

  const last = record.lastRefillAt ?? record.grantedAt;
  const availableAt = last + config.refillCooldownMs;
  if (nowMs < availableAt) {
    return {
      kind: "cooldown",
      availableAt,
      configVersion: config.version,
    };
  }

  return {
    kind: "refill",
    amount: config.refillAmount,
    configVersion: config.version,
    availableAt: nowMs + config.refillCooldownMs,
  };
}

/** Format MockUSD atomic units as a human dollar string (no symbol). */
export function formatMockUsd(amountAtomic: number): string {
  const dollars = amountAtomic / MOCK_USD_UNIT;
  return dollars.toFixed(2);
}
