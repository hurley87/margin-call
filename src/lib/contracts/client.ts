import { createPublicClient, http } from "viem";
import {
  getActiveViemChain,
  requireRpcUrl,
  resolveActiveNetworkSlug,
} from "@/lib/network";

/** Floor active-network RPC URL (Robinhood Chain testnet). */
export function activeNetworkRpcUrl(): string {
  return requireRpcUrl(resolveActiveNetworkSlug());
}

/** @deprecated Prefer activeNetworkRpcUrl. */
export function baseSepoliaRpcUrl(): string {
  return activeNetworkRpcUrl();
}

function buildPublicClient() {
  return createPublicClient({
    chain: getActiveViemChain(),
    transport: http(activeNetworkRpcUrl()),
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
