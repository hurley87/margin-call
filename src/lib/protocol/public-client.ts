import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const DEFAULT_BASE_RPC = "https://mainnet.base.org";

export function getBaseRpcUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_BASE_RPC_URL?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_BASE_RPC;
}

/**
 * Public viem client for Base mainnet reads (no wallet).
 *
 * The RPC URL is a parameter so server-only callers can supply a provisioned
 * endpoint without a second client factory drifting from this one.
 */
export function createBasePublicClient(rpcUrl: string = getBaseRpcUrl()) {
  return createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });
}

export type BasePublicClient = ReturnType<typeof createBasePublicClient>;
