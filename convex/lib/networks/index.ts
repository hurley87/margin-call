/**
 * Floor slug-driven network registry (#249) — Robinhood Chain testnet only.
 * Base Sepolia deal-game constants: `convex/lib/legacy`.
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
  FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID,
  ROBINHOOD_ERC6551_REGISTRY_ADDRESS,
  ROBINHOOD_TESTNET_CAIP2,
  ROBINHOOD_TESTNET_CHAIN_ID,
  ROBINHOOD_TESTNET_NETWORK,
  ROBINHOOD_TESTNET_SLUG,
  robinhoodTestnet,
} from "./robinhoodTestnet";

/** Re-export Base mainnet forbid constant used by Floor refuse checks. */
export { FORBIDDEN_MAINNET_CHAIN_ID } from "../legacy/baseSepolia";

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
  isActiveChainId,
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
