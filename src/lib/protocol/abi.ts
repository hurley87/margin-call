/**
 * Minimal ABI fragments for the Base happy-path workspace.
 * Handwritten on purpose — do not commit Foundry `out/` or scatter fragments in UI.
 * Lifecycle events live in @margin-call/shared/margin-call-events (shared with Convex).
 */

import {
  positionClosedEvent,
  positionLiquidatedEvent,
  positionOpenedEvent,
  transferEvent,
} from "@margin-call/shared/margin-call-events";

export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

const marginCallFunctions = [
  {
    type: "function",
    name: "openPosition",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assetId", type: "uint256" },
      { name: "stockAmount", type: "uint256" },
      { name: "targetLeverage", type: "uint256" },
      { name: "minStockOut", type: "uint256" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "repay",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "closePosition",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "currentDebt",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "assetId", type: "uint256" },
          { name: "stockAmount", type: "uint256" },
          { name: "principal", type: "uint256" },
          { name: "accruedInterest", type: "uint256" },
          { name: "lastAccruedAt", type: "uint256" },
          { name: "executor", type: "address" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "riskSnapshot",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "nav", type: "uint256" },
          { name: "currentDebt", type: "uint256" },
          { name: "liquidatable", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

/** OpenZeppelin IERC721Errors — lets viem name the revert when a token is burned. */
export const ERC721_NONEXISTENT_TOKEN = "ERC721NonexistentToken";

const marginCallErrors = [
  {
    type: "error",
    name: ERC721_NONEXISTENT_TOKEN,
    inputs: [{ name: "tokenId", type: "uint256" }],
  },
] as const;

export const marginCallAbi = [
  ...marginCallFunctions,
  ...marginCallErrors,
  positionOpenedEvent,
  positionClosedEvent,
  positionLiquidatedEvent,
  transferEvent,
] as const;

export const creditPoolAbi = [
  {
    type: "function",
    name: "availableCredit",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const oracleAdapterAbi = [
  {
    type: "function",
    name: "latestObservation",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "observation",
        type: "tuple",
        components: [
          { name: "state", type: "uint8" },
          { name: "price", type: "uint256" },
          { name: "roundId", type: "uint80" },
          { name: "updatedAt", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "valueUsdc",
    stateMutability: "view",
    inputs: [
      { name: "stockAmountRaw", type: "uint256" },
      { name: "feedAnswer", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
