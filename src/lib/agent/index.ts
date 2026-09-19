/**
 * Public agent surface (issue #491).
 *
 * Transport-agnostic on purpose: these six functions take a Base public client
 * and return plain JSON-safe data, so the HTTP routes and the MCP endpoint are
 * thin adapters over one implementation rather than two drifting copies.
 *
 * Every function is unauthenticated. Reads, quotes, and transaction
 * preparation are derived from public Base state, and nothing here signs or
 * broadcasts — the caller's own wallet does that.
 */
export { getAssets } from "@/lib/agent/assets";
export type {
  AgentAsset,
  AgentAssetsPayload,
  AgentLeveragePreset,
} from "@/lib/agent/assets";

export { getMarketState, PRICING_NOTE } from "@/lib/agent/market-state";
export type {
  AgentPricing,
  MarketStatePayload,
} from "@/lib/agent/market-state";

export { getCreditPool } from "@/lib/agent/credit-pool";
export type { CreditPoolPayload } from "@/lib/agent/credit-pool";

export { getPosition } from "@/lib/agent/position";
export type { AgentPositionPayload } from "@/lib/agent/position";

export { quoteOpen } from "@/lib/agent/quote-open";
export type { QuoteOpenInput, QuoteOpenPayload } from "@/lib/agent/quote-open";

export { prepareOpen } from "@/lib/agent/prepare-open";
export type {
  PrepareOpenInput,
  PrepareOpenPayload,
  PreparedTransaction,
} from "@/lib/agent/prepare-open";

export {
  agentError,
  agentErrorKind,
  assetOpeningDisabledError,
  AGENT_PRICING_UNAVAILABLE_REASON,
  BASE_UNAVAILABLE_MESSAGE,
} from "@/lib/agent/result";
export type {
  AgentErr,
  AgentErrorCode,
  AgentErrorKind,
  AgentOk,
  AgentResult,
} from "@/lib/agent/result";
