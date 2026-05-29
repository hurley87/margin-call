/** Shared escrow + USDC addresses for MCP BYO desk treasury (Base Sepolia). */

export const ESCROW_ADDRESS =
  "0x8AA5768AC08755cd9AEf07892e6c40edD1B5a609" as const;
export const USDC_SEPOLIA_ADDRESS =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
export const USDC_DECIMALS = 1_000_000;
export const MCP_CHAIN = "base-sepolia" as const;

/** MarginCallEscrow deal status: 0 = Open, 1 = Closed. */
export const DEAL_STATUS_CLOSED = 1;

/** Large allowance for rare one-time approve before fund/create_deal. */
export const LARGE_APPROVE_ALLOWANCE =
  BigInt(10_000_000) * BigInt(USDC_DECIMALS);

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
