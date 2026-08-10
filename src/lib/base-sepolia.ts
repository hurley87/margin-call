import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

export const BASE_SEPOLIA_CHAIN_ID = baseSepolia.id;

/** Shared read client for every Base Sepolia contract. Multicall batching
 * collapses concurrent `readContract` calls into a single RPC request. */
export const baseSepoliaPublicClient = createPublicClient({
  chain: baseSepolia,
  batch: { multicall: true },
  transport: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || undefined),
});
