import { createPublicClient, http } from "viem";
import { BASE_SEPOLIA_SLUG, getViemChain, requireRpcUrl } from "@/lib/network";

/** Legacy deal-game RPC URL — removed at #262. */
export function baseSepoliaRpcUrl(): string {
  return requireRpcUrl(BASE_SEPOLIA_SLUG);
}

function buildPublicClient() {
  return createPublicClient({
    chain: getViemChain(BASE_SEPOLIA_SLUG),
    transport: http(baseSepoliaRpcUrl()),
    // Base blocks land in ~2s; poll faster than viem's 4s default so receipt
    // waits between the approve and createDeal txs resolve promptly.
    pollingInterval: 1_000,
  });
}

let cached: ReturnType<typeof buildPublicClient> | undefined;

export function makePublicClient() {
  if (!cached) {
    cached = buildPublicClient();
  }
  return cached;
}
