import {
  ACTIVE_BASE_SEPOLIA_DEPLOYMENT,
  CONTRACTS_CHAIN,
  CONTRACTS_CHAIN_ID,
  ERC6551_DEFAULT_IMPLEMENTATION,
  ERC6551_REGISTRY_ADDRESS,
  IDENTITY_REGISTRY_ADDRESS,
  REPUTATION_REGISTRY_ADDRESS,
  USDC_SEPOLIA_ADDRESS,
  resolveAddress,
} from "@/lib/network";

/** MarginCallEscrow deal status: 0 = Open, 1 = Closed. */
export const DEAL_STATUS_OPEN = 0;
export const DEAL_STATUS_CLOSED = 1;

export const ESCROW_ADDRESS = resolveAddress(
  [process.env.NEXT_PUBLIC_ESCROW_ADDRESS, process.env.ESCROW_ADDRESS],
  ACTIVE_BASE_SEPOLIA_DEPLOYMENT.escrow,
  "ESCROW_ADDRESS"
);

export {
  IDENTITY_REGISTRY_ADDRESS,
  REPUTATION_REGISTRY_ADDRESS,
  ERC6551_REGISTRY_ADDRESS,
  CONTRACTS_CHAIN,
  CONTRACTS_CHAIN_ID,
  USDC_SEPOLIA_ADDRESS,
  ERC6551_DEFAULT_IMPLEMENTATION,
};

// ABI for MarginCallEscrow
export const escrowAbi = [
  {
    type: "function",
    name: "getBalance",
    inputs: [{ name: "traderId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balances",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
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
    name: "enterDeal",
    inputs: [
      { name: "dealId", type: "uint256" },
      { name: "traderId", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "settleEntry",
    inputs: [
      { name: "dealId", type: "uint256" },
      { name: "traderId", type: "uint256" },
      { name: "grossPayout", type: "uint256" },
      { name: "rake", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
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
  {
    type: "event",
    name: "DealEntered",
    inputs: [
      { name: "dealId", type: "uint256", indexed: true },
      { name: "traderId", type: "uint256", indexed: true },
    ],
  },
  {
    type: "event",
    name: "EntrySettled",
    inputs: [
      { name: "dealId", type: "uint256", indexed: true },
      { name: "traderId", type: "uint256", indexed: true },
      { name: "grossPayout", type: "uint256", indexed: false },
      { name: "rake", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "EntryRefunded",
    inputs: [
      { name: "dealId", type: "uint256", indexed: true },
      { name: "traderId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
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
          { name: "reservedAmount", type: "uint256" },
          { name: "maxExtractionAmount", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
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
    name: "addSettlementOperator",
    inputs: [{ name: "op", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "removeSettlementOperator",
    inputs: [{ name: "op", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "addDepositorBinder",
    inputs: [{ name: "binder", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "removeDepositorBinder",
    inputs: [{ name: "binder", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "settlementOperators",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "depositorBinders",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "refundExpiredEntry",
    inputs: [
      { name: "dealId", type: "uint256" },
      { name: "traderId", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "pause",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "unpause",
    inputs: [],
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
    type: "event",
    name: "DepositorSet",
    inputs: [
      { name: "traderId", type: "uint256", indexed: true },
      { name: "depositor", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "DealClosed",
    inputs: [{ name: "dealId", type: "uint256", indexed: true }],
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
    name: "dealCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
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

// ABI for ERC-8004 Reputation Registry (giveFeedback + read)
export const reputationRegistryAbi = [
  {
    type: "function",
    name: "giveFeedback",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "value", type: "int128" },
      { name: "valueDecimals", type: "uint8" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "endpoint", type: "string" },
      { name: "feedbackURI", type: "string" },
      { name: "feedbackHash", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getSummary",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddresses", type: "address[]" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
    ],
    outputs: [
      { name: "count", type: "uint64" },
      { name: "summaryValue", type: "int128" },
      { name: "summaryValueDecimals", type: "uint8" },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "NewFeedback",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "clientAddress", type: "address", indexed: true },
      { name: "feedbackIndex", type: "uint64", indexed: false },
      { name: "value", type: "int128", indexed: false },
      { name: "valueDecimals", type: "uint8", indexed: false },
      { name: "indexedTag1", type: "string", indexed: true },
      { name: "tag1", type: "string", indexed: false },
      { name: "tag2", type: "string", indexed: false },
      { name: "endpoint", type: "string", indexed: false },
      { name: "feedbackURI", type: "string", indexed: false },
      { name: "feedbackHash", type: "bytes32", indexed: false },
    ],
  },
] as const;

// Minimal ABI for ERC-8004 Identity Registry
export const identityRegistryAbi = [
  {
    type: "function",
    name: "ownerOf",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "register",
    inputs: [],
    outputs: [{ name: "agentId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "register",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
] as const;

// ERC-6551 Registry ABI for account computation
export const erc6551RegistryAbi = [
  {
    type: "function",
    name: "account",
    inputs: [
      { name: "implementation", type: "address" },
      { name: "salt", type: "bytes32" },
      { name: "chainId", type: "uint256" },
      { name: "tokenContract", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "createAccount",
    inputs: [
      { name: "implementation", type: "address" },
      { name: "salt", type: "bytes32" },
      { name: "chainId", type: "uint256" },
      { name: "tokenContract", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "nonpayable",
  },
] as const;
