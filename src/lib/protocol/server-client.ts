import "server-only";
import {
  createBasePublicClient,
  getBaseRpcUrl,
  type BasePublicClient,
} from "@/lib/protocol/public-client";

/**
 * Public Base client for server-side reads (NFT metadata).
 *
 * Prefers the server-only `BASE_RPC_URL` so the metadata endpoint can use a
 * provisioned endpoint without exposing it in the client bundle, and falls back
 * to the same public RPC the browser uses.
 */
export function createBaseServerClient(): BasePublicClient {
  return createBasePublicClient(
    process.env.BASE_RPC_URL?.trim() || getBaseRpcUrl()
  );
}
