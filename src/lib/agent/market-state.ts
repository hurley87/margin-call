import {
  AGENT_PRICING_UNAVAILABLE_REASON,
  readBase,
  type AgentResult,
} from "@/lib/agent/result";
import { parseAssetSelector, type AssetSelector } from "@/lib/agent/input";
import { ORACLE_STATE, type OracleState } from "@/lib/protocol/constants";
import type { LaunchAssetName } from "@/lib/protocol/deployment";
import type { BasePublicClient } from "@/lib/protocol/public-client";
import { loadMarketObservation } from "@/lib/protocol/reads";
import {
  PRICING_AVAILABILITY_CAVEAT,
  PRICING_AVAILABILITY_NOTE,
} from "@/lib/protocol/readiness";

/**
 * HELD and INVALID are protocol detail. Both mean the same thing to a caller
 * deciding whether to borrow: there is no fresh price to size a loan against.
 */
export type AgentPricing = "live" | "unavailable";

export type MarketStatePayload = {
  asset: LaunchAssetName;
  assetId: number;
  pricing: AgentPricing;
  canOpenLeveragedPosition: boolean;
  /** Present only when pricing is unavailable. */
  reason?: string;
  pricingNote: string;
  /** Oracle observation time, ISO-8601, or null when the feed has never set one. */
  priceUpdatedAt: string | null;
};

export const PRICING_NOTE = `${PRICING_AVAILABILITY_NOTE} ${PRICING_AVAILABILITY_CAVEAT}`;

export function toPricing(state: OracleState): AgentPricing {
  return state === ORACLE_STATE.LIVE ? "live" : "unavailable";
}

function observedAt(updatedAt: bigint): string | null {
  if (updatedAt <= 0n) return null;
  return new Date(Number(updatedAt) * 1000).toISOString();
}

/**
 * Whether one launch rail can currently back a financed open.
 *
 * Spot opens do not consult the oracle on-chain, so `canOpenLeveragedPosition`
 * is strictly about borrowing — it is not a claim that the asset is unusable.
 */
export async function getMarketState(
  client: BasePublicClient,
  selector: AssetSelector
): Promise<AgentResult<MarketStatePayload>> {
  const asset = parseAssetSelector(selector);
  if (!asset.ok) return asset;

  const observation = await readBase(() =>
    loadMarketObservation(client, asset.value)
  );
  if (!observation.ok) return observation;

  const pricing = toPricing(observation.value.state);

  return {
    ok: true,
    asset: asset.value.name,
    assetId: asset.value.assetId,
    pricing,
    canOpenLeveragedPosition: pricing === "live",
    ...(pricing === "live" ? {} : { reason: AGENT_PRICING_UNAVAILABLE_REASON }),
    pricingNote: PRICING_NOTE,
    priceUpdatedAt: observedAt(observation.value.updatedAt),
  };
}
