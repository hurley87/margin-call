/**
 * Wallet-agnostic signer for agents. Dynamic is one implementation — Bankr,
 * Coinbase, or a bare viem account can satisfy the same shape.
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
};

export type AgentWallet = {
  address: `0x${string}`;
  sendTransaction: (tx: UnsignedTransaction) => Promise<`0x${string}`>;
  waitForReceipt: (hash: `0x${string}`) => Promise<TransactionReceiptSummary>;
};
