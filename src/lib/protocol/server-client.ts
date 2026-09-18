import "server-only";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { getBaseRpcUrl } from "@/lib/protocol/public-client";

/**
 * Public Base client for server-side reads (NFT metadata).
 *
 * Prefers the server-only `BASE_RPC_URL` so the metadata endpoint can use a
 * provisioned endpoint without exposing it in the client bundle, and falls back
 * to the same public RPC the browser uses.
 */
export function createBaseServerClient() {
  const rpcUrl = process.env.BASE_RPC_URL?.trim() || getBaseRpcUrl();
  return createPublicClient({ chain: base, transport: http(rpcUrl) });
}
