import type { Log } from "viem";

/**
 * Wallet-agnostic Base signer for agents. Dynamic is one implementation —
 * Bankr, Coinbase, or a bare viem account can satisfy the same shape.
 */
export type UnsignedTransaction = {
  to: `0x${string}`;
  data?: `0x${string}`;
  value?: bigint;
};

export type TransactionReceiptSummary = {
  hash: `0x${string}`;
  status: "success" | "reverted";
  blockNumber: bigint;
  /** Present when the signer surfaces receipt logs; used to decode token ids. */
  logs?: readonly Log[];
};

/** EIP-712 payload. Used for Permit2 when the Uniswap quote requires it. */
export type WalletTypedData = {
  domain: Record<string, unknown>;
  types: Record<string, readonly { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
};

export type AgentWallet = {
  address: `0x${string}`;
  sendTransaction: (tx: UnsignedTransaction) => Promise<`0x${string}`>;
  waitForReceipt: (hash: `0x${string}`) => Promise<TransactionReceiptSummary>;
};

/** EIP-712 signing for the Dynamic + Uniswap path when Permit2 is present. */
export type TypedDataAgentWallet = AgentWallet & {
  signTypedData: (typedData: WalletTypedData) => Promise<`0x${string}`>;
};
