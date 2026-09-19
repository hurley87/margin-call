/**
 * Agent wallet adapters.
 *
 * Margin Call's public agent surface (`src/lib/agent`) is wallet-agnostic.
 * This module is the reference wallet implementation (Dynamic server wallets)
 * plus a small interface other Base signers can satisfy.
 */
export type {
  AgentWallet,
  TransactionReceiptSummary,
  TypedDataAgentWallet,
  UnsignedTransaction,
  WalletTypedData,
} from "@/lib/wallets/adapter";

export {
  readWalletBalances,
  type BalanceClient,
  type TokenBalance,
  type TokenSpec,
  type WalletBalances,
} from "@/lib/wallets/balances";

export {
  createDynamicAgentWallet,
  dynamicWalletAddress,
  provisionOrResolveDynamicWallet,
  type DynamicServerWalletApi,
  type ProvisionedDynamicWallet,
} from "@/lib/wallets/dynamic-server";

export {
  fileWalletMetadataStore,
  type DynamicWalletMetadata,
  type WalletMetadataStore,
} from "@/lib/wallets/metadata-store";

export {
  readDynamicServerWalletEnv,
  type DynamicServerWalletEnv,
} from "@/lib/wallets/config";

export {
  acquireSupportedStock,
  permitDataToTypedData,
  type AcquireStockResult,
} from "@/lib/wallets/acquire-stock";
