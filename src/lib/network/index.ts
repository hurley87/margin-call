/**
 * Next.js re-exports of the Floor network registry (source: convex/lib/networks).
 * Legacy Base Sepolia: `@/lib/legacy`.
 */
export {
  ACTIVE_NETWORK_ENV_KEY,
  ACTIVE_NETWORK_PUBLIC_ENV_KEY,
  DEFAULT_ACTIVE_NETWORK_SLUG,
  FORBIDDEN_MAINNET_CHAIN_ID,
  FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID,
  ROBINHOOD_TESTNET_CAIP2,
  ROBINHOOD_TESTNET_CHAIN_ID,
  ROBINHOOD_TESTNET_NETWORK,
  ROBINHOOD_TESTNET_SLUG,
  addressUrl,
  assetLabel,
  assertNotForbiddenMainnet,
  blockUrl,
  getActiveNetwork,
  getActiveViemChain,
  getConfirmationPolicy,
  getNetwork,
  getViemChain,
  isActiveChainId,
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
  type NetworkConfig,
  type NetworkSlug,
} from "../../../convex/lib/networks";

export { resolveAddress } from "../../../convex/lib/resolveAddress";
