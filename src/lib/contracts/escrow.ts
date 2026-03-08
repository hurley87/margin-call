import { baseSepolia } from "viem/chains";

export const ESCROW_ADDRESS =
  "0x5bF862884263388611918149D935366752649a8D" as const;

export const IDENTITY_REGISTRY_ADDRESS =
  "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;

export const REPUTATION_REGISTRY_ADDRESS =
  "0x8004B663056A597Dffe9eCcC1965A193B7388713" as const;

export const ERC6551_REGISTRY_ADDRESS =
  "0x000000006551c19487814612e58FE06813775758" as const;

export const CONTRACTS_CHAIN = baseSepolia;
export const CONTRACTS_CHAIN_ID = baseSepolia.id;

// USDC on Base Sepolia (Circle test token)
export const USDC_SEPOLIA_ADDRESS =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

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
    name: "resolveEntry",
    inputs: [
      { name: "dealId", type: "uint256" },
      { name: "traderId", type: "uint256" },
      { name: "pnl", type: "int256" },
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
    name: "EntryResolved",
    inputs: [
      { name: "dealId", type: "uint256", indexed: true },
      { name: "traderId", type: "uint256", indexed: true },
      { name: "pnl", type: "int256", indexed: false },
      { name: "rake", type: "uint256", indexed: false },
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
        ],
      },
    ],
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

// Default ERC-6551 account implementation (reference implementation on Base Sepolia)
export const ERC6551_DEFAULT_IMPLEMENTATION =
  "0x55266d75D1a14E4572138116aF39863Ed6596E7F" as const;
