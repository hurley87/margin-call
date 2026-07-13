import { createPublicClient, http } from "viem";
import { CONTRACTS_CHAIN } from "./escrow";
import { requireBaseSepoliaRpcUrl } from "@/lib/network";

export function baseSepoliaRpcUrl(): string {
  return requireBaseSepoliaRpcUrl();
}

function buildPublicClient() {
  return createPublicClient({
    chain: CONTRACTS_CHAIN,
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
