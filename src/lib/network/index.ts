/** Next.js re-exports of canonical Base Sepolia configuration (source: convex/lib/). */
export {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_CAIP2,
  BASE_SEPOLIA_SLUG,
  CONTRACTS_CHAIN,
  CONTRACTS_CHAIN_ID,
  ERC6551_DEFAULT_IMPLEMENTATION,
  ERC6551_REGISTRY_ADDRESS,
  FORBIDDEN_MAINNET_CHAIN_ID,
  FORBIDDEN_MAINNET_USDC,
  IDENTITY_REGISTRY_ADDRESS,
  REPUTATION_REGISTRY_ADDRESS,
  USDC_SEPOLIA_ADDRESS,
  isBaseSepoliaChainId,
} from "../../../convex/lib/baseSepoliaNetwork";

export {
  ACTIVE_BASE_SEPOLIA_DEPLOYMENT,
  type ActiveBaseSepoliaDeployment,
} from "../../../convex/lib/activeDeployment";

export { resolveAddress } from "../../../convex/lib/resolveAddress";
export { requireBaseSepoliaRpcUrl } from "../../../convex/lib/requireBaseSepoliaRpcUrl";
