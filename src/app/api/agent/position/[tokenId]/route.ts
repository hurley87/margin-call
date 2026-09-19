import {
  agentJson,
  agentPreflight,
  POSITION_CACHE,
} from "@/app/api/agent/response";
import { getPosition } from "@/lib/agent";
import { createBaseServerClient } from "@/lib/protocol/server-client";

/**
 * Live Position NFT state from Base.
 *
 * Distinct from `GET /api/nft/[tokenId]`, which serves marketplace metadata
 * and deliberately withholds debt and NAV. This one reports the financials an
 * agent needs to reason about a position it holds or is considering.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tokenId: string }> }
): Promise<Response> {
  const { tokenId } = await params;

  const position = await getPosition(createBaseServerClient(), { tokenId });

  return agentJson(position, POSITION_CACHE);
}

export function OPTIONS(): Response {
  return agentPreflight();
}
