import {
  agentJson,
  agentPreflight,
  NO_STORE,
  readJsonBody,
} from "@/app/api/agent/response";
import { prepareOpen } from "@/lib/agent";
import { createBaseServerClient } from "@/lib/protocol/server-client";

/**
 * Unsigned Base transactions that open a position for the caller's wallet.
 *
 * Returns calldata only. Margin Call holds no key, signs nothing, and
 * broadcasts nothing — the caller's own wallet does all three.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return agentJson(body, NO_STORE);

  const prepared = await prepareOpen(createBaseServerClient(), {
    wallet: body.value.wallet,
    asset: body.value.asset,
    assetId: body.value.assetId,
    stockAmount: body.value.stockAmount,
    leverage: body.value.leverage,
    thesis: body.value.thesis,
  });

  return agentJson(prepared, NO_STORE);
}

export function OPTIONS(): Response {
  return agentPreflight();
}
