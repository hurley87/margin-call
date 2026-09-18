import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const DEFAULT_BASE_RPC = "https://mainnet.base.org";

export function getBaseRpcUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_BASE_RPC_URL?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_BASE_RPC;
}

/** Public viem client for Base mainnet reads (no wallet). */
export function createBasePublicClient() {
  return createPublicClient({
    chain: base,
    transport: http(getBaseRpcUrl()),
  });
}

export type BasePublicClient = ReturnType<typeof createBasePublicClient>;
