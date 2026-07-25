/**
 * Network registry — lookup by slug (#249).
 * Environment-free: no RPC, no env reads.
 */
import {
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_SLUG,
  FORBIDDEN_MAINNET_CHAIN_ID,
  baseSepoliaChain,
} from "./base-sepolia";
import {
  FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID,
  ROBINHOOD_TESTNET_NETWORK,
  ROBINHOOD_TESTNET_SLUG,
  robinhoodTestnet,
} from "./robinhood-testnet";
import type { NetworkConfig, NetworkSlug } from "./types";
import type { Chain } from "viem";

const NETWORKS: Record<NetworkSlug, NetworkConfig> = {
  [ROBINHOOD_TESTNET_SLUG]: ROBINHOOD_TESTNET_NETWORK,
  [BASE_SEPOLIA_SLUG]: BASE_SEPOLIA_NETWORK,
};

const VIEM_CHAINS: Record<NetworkSlug, Chain> = {
  [ROBINHOOD_TESTNET_SLUG]: robinhoodTestnet,
  [BASE_SEPOLIA_SLUG]: baseSepoliaChain,
};

export const SUPPORTED_SLUGS = Object.keys(NETWORKS) as NetworkSlug[];

/** All registered network configs. */
export function listNetworks(): readonly NetworkConfig[] {
  return SUPPORTED_SLUGS.map((slug) => NETWORKS[slug]);
}

/** True when `value` is a known NetworkSlug. */
export function isNetworkSlug(value: string): value is NetworkSlug {
  return value === ROBINHOOD_TESTNET_SLUG || value === BASE_SEPOLIA_SLUG;
}

/**
 * Resolve a network by slug. Throws on unknown slug.
 */
export function getNetwork(slug: NetworkSlug | string): NetworkConfig {
  if (!isNetworkSlug(slug)) {
    throw new Error(
      `Unknown network slug "${slug}". Supported: ${SUPPORTED_SLUGS.join(", ")}.`
    );
  }
  return NETWORKS[slug];
}

/** Viem Chain for a network slug. */
export function getViemChain(slug: NetworkSlug | string): Chain {
  const network = getNetwork(slug);
  return VIEM_CHAINS[network.slug];
}

/**
 * Refuse any known mainnet chain ID (Base 8453 or Robinhood 4663).
 * Call before signing / submitting.
 */
export function assertNotForbiddenMainnet(chainId: string | number): void {
  const numeric =
    typeof chainId === "number"
      ? chainId
      : chainId.startsWith("eip155:")
        ? Number(chainId.slice("eip155:".length))
        : Number(chainId);

  if (
    numeric === FORBIDDEN_MAINNET_CHAIN_ID ||
    numeric === FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID
  ) {
    throw new Error(
      `Forbidden mainnet chain ID ${numeric}. Margin Call Floor paths refuse Base mainnet (${FORBIDDEN_MAINNET_CHAIN_ID}) and Robinhood Chain mainnet (${FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID}).`
    );
  }
}

/** True when chainId is a forbidden mainnet (Base or Robinhood). */
export function isForbiddenMainnetChainId(chainId: string | number): boolean {
  try {
    assertNotForbiddenMainnet(chainId);
    return false;
  } catch {
    return true;
  }
}
