/**
 * Next.js re-exports of the slug-driven network registry (source: convex/lib/networks).
 * Legacy Base Sepolia symbols remain for deal-game consumers until #262.
 */
export {
  ACTIVE_BASE_SEPOLIA_DEPLOYMENT,
  BASE_SEPOLIA_CAIP2,
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_SLUG,
  DEFAULT_ACTIVE_NETWORK_SLUG,
  ERC6551_DEFAULT_IMPLEMENTATION,
  ERC6551_REGISTRY_ADDRESS,
  FORBIDDEN_MAINNET_CHAIN_ID,
  FORBIDDEN_MAINNET_USDC,
  FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID,
  IDENTITY_REGISTRY_ADDRESS,
  REPUTATION_REGISTRY_ADDRESS,
  ROBINHOOD_TESTNET_CAIP2,
  ROBINHOOD_TESTNET_CHAIN_ID,
  ROBINHOOD_TESTNET_NETWORK,
  ROBINHOOD_TESTNET_SLUG,
  USDC_SEPOLIA_ADDRESS,
  addressUrl,
  assetLabel,
  assertNotForbiddenMainnet,
  baseSepoliaChain,
  blockUrl,
  getActiveNetwork,
  getActiveViemChain,
  getConfirmationPolicy,
  getNetwork,
  getViemChain,
  isBaseSepoliaChainId,
  isForbiddenMainnetChainId,
  isNetworkSlug,
  isTestAsset,
  listNetworks,
  listTestAssets,
  recommendWaitBlocks,
  requireRpcUrl,
  resolveActiveNetworkSlug,
  robinhoodTestnet,
  seatVaultConfirmationDepth,
  txUrl,
  type ActiveBaseSepoliaDeployment,
  type NetworkConfig,
  type NetworkSlug,
} from "../../../convex/lib/networks";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_SLUG,
  baseSepoliaChain,
  requireRpcUrl,
} from "../../../convex/lib/networks";

export { resolveAddress } from "../../../convex/lib/resolveAddress";

/** @deprecated Prefer getViemChain(BASE_SEPOLIA_SLUG) or getActiveViemChain(). */
export const CONTRACTS_CHAIN = baseSepoliaChain;

/** @deprecated Prefer BASE_SEPOLIA_CHAIN_ID or getActiveNetwork().chainId. */
export const CONTRACTS_CHAIN_ID = BASE_SEPOLIA_CHAIN_ID;

/**
 * @deprecated Prefer requireRpcUrl(BASE_SEPOLIA_SLUG) or requireRpcUrl(getActiveNetwork().slug).
 */
export function requireBaseSepoliaRpcUrl(): string {
  return requireRpcUrl(BASE_SEPOLIA_SLUG);
}
