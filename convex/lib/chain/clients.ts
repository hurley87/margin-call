/**
 * Chain clients for Convex Node actions.
 * Source of truth: `@margin-call/shared`.
 */
export {
  getRobinhoodRpcUrl as getRpcUrl,
  createRobinhoodPublicClient as createChainPublicClient,
  createRobinhoodWalletClient as createMinterWalletClient,
  parsePrivateKey,
} from "@margin-call/shared";
