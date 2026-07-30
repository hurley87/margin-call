/**
 * Pure Starter Grant policy (one-time grant + rate-limited refill).
 * Source of truth: `@margin-call/shared`.
 */
export {
  MOCK_USD_DECIMALS,
  MOCK_USD_UNIT,
  STARTER_GRANT_CONFIG_V1,
  STARTER_GRANT_CONFIG,
  decideStarterGrant,
  decideRefill,
  formatMockUsd,
  type StarterGrantConfig,
  type GrantRecord,
  type GrantDecision,
} from "@margin-call/shared";
