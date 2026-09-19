import { agentError, readBase, type AgentResult } from "@/lib/agent/result";
import { parseTokenId } from "@/lib/agent/input";
import type { AgentPricing } from "@/lib/agent/market-state";
import {
  resolvePositionStage,
  stockSymbol,
  type PositionStage,
} from "@/lib/positions/artwork";
import { getAssetById, type LaunchAssetName } from "@/lib/protocol/deployment";
import type { BasePublicClient } from "@/lib/protocol/public-client";
import { loadPosition } from "@/lib/protocol/reads";

export type AgentPositionPayload = {
  tokenId: string;
  asset: LaunchAssetName | null;
  symbol: string | null;
  assetId: number;
  stockAmount: string;
  principal: string;
  currentDebt: string;
  owner: `0x${string}`;
  executor: `0x${string}`;
  thesis: string;
  /** Oracle NAV in USDC base units, or null when pricing is not live. */
  nav: string | null;
  liquidatable: boolean | null;
  pricing: AgentPricing;
  stage: PositionStage;
};

/**
 * Read one live Position NFT from Base.
 *
 * Base is authoritative for debt and NAV, so this never consults the Convex
 * discovery index. Health is reported as the same stage the site renders, with
 * `nav`/`liquidatable` left null rather than guessed when pricing is stale.
 */
export async function getPosition(
  client: BasePublicClient,
  input: { tokenId: unknown }
): Promise<AgentResult<AgentPositionPayload>> {
  const tokenId = parseTokenId(input.tokenId);
  if (!tokenId.ok) return tokenId;

  const position = await readBase(() => loadPosition(client, tokenId.value));
  if (!position.ok) return position;

  // Burned and never-minted are the same fact on Base: no live token.
  if (position.value.status === "burned") {
    return agentError(
      "POSITION_NOT_FOUND",
      `No live position for token id ${tokenId.value}.`
    );
  }

  const live = position.value;
  const asset = getAssetById(live.assetId);

  return {
    ok: true,
    tokenId: live.tokenId.toString(),
    asset: asset?.name ?? null,
    symbol: stockSymbol(live.assetId),
    assetId: live.assetId,
    stockAmount: live.stockAmount.toString(),
    principal: live.principal.toString(),
    currentDebt: live.currentDebt.toString(),
    owner: live.owner,
    executor: live.executor,
    thesis: live.thesis,
    nav: live.nav?.toString() ?? null,
    liquidatable: live.liquidatable,
    pricing: live.nav == null ? "unavailable" : "live",
    stage: resolvePositionStage({
      currentDebt: live.currentDebt,
      nav: live.nav,
      liquidatable: live.liquidatable,
    }),
  };
}
