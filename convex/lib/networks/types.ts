/**
 * Shared types for the slug-driven multi-network registry (#249).
 * Environment-free: no RPC, no env reads.
 */

/** Supported network slugs. Default active network is robinhood-testnet. */
export type NetworkSlug = "robinhood-testnet" | "base-sepolia";

/** Asset / dependency status from the #248 packet. */
export type AssetStatus = "canonical" | "test-asset-fallback" | "unverified";

export type NetworkAsset = {
  id: string;
  kind: string;
  status: AssetStatus;
  /** User-visible label. Test Asset fallbacks must include "Margin Call Test Asset". */
  label: string;
  address: `0x${string}` | null;
  ticker?: string;
  decimalsHint?: number;
};

export type ConfirmationPolicy = {
  /** How many receipt confirmations to wait before treating a tx as final. */
  recommendWaitBlocks: number;
  finalityModel: string;
  notes: string;
  /**
   * SeatVault indexer confirmation depth (legacy Base path).
   * Unused on robinhood-testnet until SeatVault is retired (#262).
   */
  seatVaultConfirmationDepth?: number;
};

export type NetworkExplorer = {
  browserUrl: string;
  apiUrl: string;
  name: string;
};

export type NetworkNativeAsset = {
  symbol: string;
  decimals: number;
  label: string;
};

export type NetworkRpcEnv = {
  /** Preferred Convex / server env key. */
  primaryEnvKey: string;
  /** Optional Next.js public env key. */
  publicEnvKey?: string;
};

/**
 * Complete network configuration resolved by slug.
 * Viem `Chain` is attached per-network so clients can create transports.
 */
export type NetworkConfig = {
  slug: NetworkSlug;
  name: string;
  chainId: number;
  caip2: `eip155:${number}`;
  /** True when this network is the legacy deal-game path (removed at #262). */
  legacy: boolean;
  nativeGasAsset: NetworkNativeAsset;
  rpc: NetworkRpcEnv;
  /** Public RPC documented for operators; never used as a silent runtime fallback. */
  publicRpcUrl: string;
  explorer: NetworkExplorer;
  faucet?: string;
  confirmation: ConfirmationPolicy;
  forbiddenMainnetChainId: number;
  assets: readonly NetworkAsset[];
};
