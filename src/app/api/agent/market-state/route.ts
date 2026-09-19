import { agentJson, agentPreflight, NO_STORE } from "@/app/api/agent/response";
import { getMarketState } from "@/lib/agent";
import { createBaseServerClient } from "@/lib/protocol/server-client";

/**
 * Pricing and opening availability for one launch asset: `?asset=NVDAc` or
 * `?assetId=1`. Answers whether Margin Call will finance an open right now,
 * without naming the oracle state that produced the answer.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;

  const state = await getMarketState(createBaseServerClient(), {
    asset: params.get("asset"),
    assetId: params.get("assetId"),
  });

  return agentJson(state, NO_STORE);
}

export function OPTIONS(): Response {
  return agentPreflight();
}
