import {
  agentJson,
  agentPreflight,
  ASSETS_CACHE,
} from "@/app/api/agent/response";
import { getAssets } from "@/lib/agent";

/**
 * Curated launch assets and canonical Base addresses.
 *
 * Unauthenticated and RPC-free: an agent should be able to discover what
 * Margin Call supports before it holds a wallet or an endpoint.
 */
export function GET(): Response {
  return agentJson(getAssets(), ASSETS_CACHE);
}

export function OPTIONS(): Response {
  return agentPreflight();
}
