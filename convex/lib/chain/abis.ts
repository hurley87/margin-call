/** Minimal ABIs for Convex chain actions (keep aligned with src/lib/contracts/abis.ts). */

export const mockUsdAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const packCustodyAbi = [
  {
    type: "function",
    name: "basketOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      {
        name: "basket",
        type: "tuple[]",
        components: [
          { name: "asset", type: "address" },
          { name: "amount", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "creatorOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "PackMinted",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "assets", type: "address[]", indexed: false },
      { name: "amounts", type: "uint256[]", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PackToppedUp",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "assets", type: "address[]", indexed: false },
      { name: "amounts", type: "uint256[]", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PackUnlisted",
    inputs: [{ name: "tokenId", type: "uint256", indexed: true }],
  },
] as const;

export const ripEngineAbi = [
  {
    type: "function",
    name: "restingPackIds",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "eligibleSnapshot",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "tokenIds", type: "uint256[]" },
      { name: "navs", type: "uint256[]" },
      { name: "eligibleCount", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "quoteRip",
    stateMutability: "view",
    inputs: [{ name: "count", type: "uint256" }],
    outputs: [
      { name: "eligible", type: "uint256" },
      { name: "hm", type: "uint256" },
      { name: "unitPrice", type: "uint256" },
      { name: "totalPayment", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "navOfPack",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "nav", type: "uint256" }],
  },
  {
    type: "event",
    name: "PackEntered",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "maker", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "PackExited",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "maker", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "PackRipped",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "taker", type: "address", indexed: true },
      { name: "maker", type: "address", indexed: true },
      { name: "nav", type: "uint256", indexed: false },
      { name: "unitPrice", type: "uint256", indexed: false },
      { name: "protocolCut", type: "uint256", indexed: false },
      { name: "crownCut", type: "uint256", indexed: false },
      { name: "toMakers", type: "uint256", indexed: false },
    ],
  },
] as const;

export const assetRegistryAbi = [
  {
    type: "function",
    name: "surcharge",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
