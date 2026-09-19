import { agentJson, agentPreflight, NO_STORE } from "@/app/api/agent/response";
import { getCreditPool } from "@/lib/agent";
import { createBaseServerClient } from "@/lib/protocol/server-client";

/** USDC the CreditPool can still lend — the ceiling on any single open. */
export async function GET(): Promise<Response> {
  return agentJson(await getCreditPool(createBaseServerClient()), NO_STORE);
}

export function OPTIONS(): Response {
  return agentPreflight();
}
