/** Shared escrow + USDC addresses for MCP BYO desk treasury (Base Sepolia). */

const RESOLVED_ESCROW_ADDRESS =
  process.env.ESCROW_ADDRESS ?? process.env.NEXT_PUBLIC_ESCROW_ADDRESS;

if (!RESOLVED_ESCROW_ADDRESS) {
  throw new Error(
    "ESCROW_ADDRESS env is not set in Convex. Run `npx convex env set ESCROW_ADDRESS <address>` (matching the deployed MarginCallEscrow)."
  );
}

export const ESCROW_ADDRESS = RESOLVED_ESCROW_ADDRESS as `0x${string}`;
export const USDC_SEPOLIA_ADDRESS =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
export const USDC_DECIMALS = 1_000_000;
export const MCP_CHAIN = "base-sepolia" as const;

/** MarginCallEscrow deal status: 0 = Open, 1 = Closed. */
export const DEAL_STATUS_CLOSED = 1;

export const PREPARE_INSTRUCTIONS =
  "Execute via Base MCP send_calls with chain and calls, approve in Base Account, then call confirm_intent with intentId and txHash.";

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export const escrowAbi = [
  {
    type: "function",
    name: "createDeal",
    inputs: [
      { name: "prompt", type: "string" },
      { name: "potAmount", type: "uint256" },
      { name: "entryCost", type: "uint256" },
    ],
    outputs: [{ name: "dealId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "closeDeal",
    inputs: [{ name: "dealId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "depositFor",
    inputs: [
      { name: "traderId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [
      { name: "traderId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "depositors",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setDepositor",
    inputs: [
      { name: "traderId", type: "uint256" },
      { name: "depositor", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getBalance",
    inputs: [{ name: "traderId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasPendingEntry",
    inputs: [
      { name: "dealId", type: "uint256" },
      { name: "traderId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getDeal",
    inputs: [{ name: "dealId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "creator", type: "address" },
          { name: "prompt", type: "string" },
          { name: "potAmount", type: "uint256" },
          { name: "entryCost", type: "uint256" },
          { name: "fee", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "pendingEntries", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "DealCreated",
    inputs: [
      { name: "dealId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "prompt", type: "string", indexed: false },
      { name: "pot", type: "uint256", indexed: false },
      { name: "entryCost", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Deposit",
    inputs: [
      { name: "traderId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdrawal",
    inputs: [
      { name: "traderId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export type PreparedCall = {
  to: `0x${string}`;
  value: bigint;
  data: `0x${string}`;
};

export type SerializedPreparedCall = {
  to: string;
  value: string;
  data: string;
};

export function serializeCall(call: PreparedCall): SerializedPreparedCall {
  return {
    to: call.to,
    value: `0x${call.value.toString(16)}`,
    data: call.data,
  };
}
