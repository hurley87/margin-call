import {
  agentJson,
  agentPreflight,
  NO_STORE,
  readJsonBody,
} from "@/app/api/agent/response";
import { quoteOpen } from "@/lib/agent";
import { createBaseServerClient } from "@/lib/protocol/server-client";

/**
 * Whether a requested open is possible right now, and how it would be sized.
 *
 * POST because the input is a small object rather than a resource path; the
 * handler itself only reads Base and never writes.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return agentJson(body, NO_STORE);

  const quote = await quoteOpen(createBaseServerClient(), {
    asset: body.value.asset,
    assetId: body.value.assetId,
    stockAmount: body.value.stockAmount,
    leverage: body.value.leverage,
  });

  return agentJson(quote, NO_STORE);
}

export function OPTIONS(): Response {
  return agentPreflight();
}
