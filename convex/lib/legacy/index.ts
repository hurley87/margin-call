/**
 * Legacy Base Sepolia deal-game constants (#262 deletes this package).
 * Floor registry lives in `convex/lib/networks` and is Robinhood-only.
 */

export {
  BASE_SEPOLIA_CAIP2,
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_SLUG,
  ERC6551_DEFAULT_IMPLEMENTATION,
  ERC6551_REGISTRY_ADDRESS,
  FORBIDDEN_MAINNET_CHAIN_ID,
  FORBIDDEN_MAINNET_USDC,
  IDENTITY_REGISTRY_ADDRESS,
  LEGACY_BASE_SEPOLIA_RECOMMEND_WAIT_BLOCKS,
  LEGACY_SEAT_VAULT_CONFIRMATION_DEPTH,
  REPUTATION_REGISTRY_ADDRESS,
  USDC_SEPOLIA_ADDRESS,
  baseSepoliaChain,
  isBaseSepoliaChainId,
  requireBaseSepoliaRpcUrl,
} from "./baseSepolia";

export {
  ACTIVE_BASE_SEPOLIA_DEPLOYMENT,
  type ActiveBaseSepoliaDeployment,
} from "./deployments";
