/**
 * Slug-driven multi-network registry (#249).
 * Re-exports the public surface used by Convex and Next.js.
 */

export type {
  AssetStatus,
  ConfirmationPolicy,
  NetworkAsset,
  NetworkConfig,
  NetworkExplorer,
  NetworkNativeAsset,
  NetworkRpcEnv,
  NetworkSlug,
} from "./types";

export {
  BASE_SEPOLIA_CAIP2,
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_SLUG,
  ERC6551_DEFAULT_IMPLEMENTATION,
  ERC6551_REGISTRY_ADDRESS,
  FORBIDDEN_MAINNET_CHAIN_ID,
  FORBIDDEN_MAINNET_USDC,
  IDENTITY_REGISTRY_ADDRESS,
  REPUTATION_REGISTRY_ADDRESS,
  USDC_SEPOLIA_ADDRESS,
  baseSepoliaChain,
  isBaseSepoliaChainId,
} from "./base-sepolia";

export {
  FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID,
  ROBINHOOD_ERC6551_REGISTRY_ADDRESS,
  ROBINHOOD_TESTNET_CAIP2,
  ROBINHOOD_TESTNET_CHAIN_ID,
  ROBINHOOD_TESTNET_NETWORK,
  ROBINHOOD_TESTNET_SLUG,
  robinhoodTestnet,
} from "./robinhood-testnet";

export {
  SUPPORTED_SLUGS,
  assertNotForbiddenMainnet,
  getNetwork,
  getViemChain,
  isForbiddenMainnetChainId,
  isNetworkSlug,
  listNetworks,
} from "./registry";

export {
  ACTIVE_NETWORK_ENV_KEY,
  ACTIVE_NETWORK_PUBLIC_ENV_KEY,
  DEFAULT_ACTIVE_NETWORK_SLUG,
  getActiveNetwork,
  getActiveViemChain,
  resolveActiveNetworkSlug,
} from "./active";

export { requireRpcUrl } from "./rpc";

export { addressUrl, blockUrl, txUrl } from "./explorer";

export { assetLabel, getAsset, isTestAsset, listTestAssets } from "./assets";

export {
  getConfirmationPolicy,
  recommendWaitBlocks,
  seatVaultConfirmationDepth,
} from "./confirmations";

export {
  ACTIVE_BASE_SEPOLIA_DEPLOYMENT,
  type ActiveBaseSepoliaDeployment,
} from "./deployments";
