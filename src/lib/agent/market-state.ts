import {
  AGENT_PRICING_UNAVAILABLE_REASON,
  assetOpeningDisabledMessage,
  readBase,
  type AgentResult,
} from "@/lib/agent/result";
import { parseAssetSelector, type AssetSelector } from "@/lib/agent/input";
import { ORACLE_STATE, type OracleState } from "@/lib/protocol/constants";
import type { LaunchAssetName } from "@/lib/protocol/deployment";
import type { BasePublicClient } from "@/lib/protocol/public-client";
import {
  loadAssetOpeningEnabled,
  loadMarketObservation,
} from "@/lib/protocol/reads";
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
  /** Live `MarginCall.assetConfig(assetId).openingEnabled`. */
  openingEnabled: boolean;
  canOpenLeveragedPosition: boolean;
  /** Present when a financed open is not possible, naming why. */
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
 * `canOpenLeveragedPosition` is true only when pricing is live and the
 * coordinator still accepts new mints. Spot opens skip the oracle on-chain,
 * so a false here from stale pricing is not a claim that 1.0x is unusable.
 */
export async function getMarketState(
  client: BasePublicClient,
  selector: AssetSelector
): Promise<AgentResult<MarketStatePayload>> {
  const asset = parseAssetSelector(selector);
  if (!asset.ok) return asset;

  const reads = await readBase(async () => {
    const [observation, openingEnabled] = await Promise.all([
      loadMarketObservation(client, asset.value),
      loadAssetOpeningEnabled(client, asset.value.assetId),
    ]);
    return { observation, openingEnabled };
  });
  if (!reads.ok) return reads;

  const pricing = toPricing(reads.value.observation.state);
  const { openingEnabled } = reads.value;
  const canOpenLeveragedPosition = pricing === "live" && openingEnabled;

  let reason: string | undefined;
  if (!openingEnabled) {
    reason = assetOpeningDisabledMessage(asset.value.name);
  } else if (pricing !== "live") {
    reason = AGENT_PRICING_UNAVAILABLE_REASON;
  }

  return {
    ok: true,
    asset: asset.value.name,
    assetId: asset.value.assetId,
    pricing,
    openingEnabled,
    canOpenLeveragedPosition,
    ...(reason == null ? {} : { reason }),
    pricingNote: PRICING_NOTE,
    priceUpdatedAt: observedAt(reads.value.observation.updatedAt),
  };
}
