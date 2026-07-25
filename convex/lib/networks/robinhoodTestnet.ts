/**
 * Robinhood Chain testnet network config (#249).
 * Derived from contracts/deployments/robinhood-testnet.dependencies.json (#248).
 * Environment-free: no RPC, no env reads.
 */
import { defineChain } from "viem";
import type { NetworkConfig } from "./types";

export const ROBINHOOD_TESTNET_CHAIN_ID = 46630 as const;
export const ROBINHOOD_TESTNET_CAIP2 = "eip155:46630" as const;
export const ROBINHOOD_TESTNET_SLUG = "robinhood-testnet" as const;
export const FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID = 4663 as const;

/** Canonical ERC-6551 registry CREATE2 address (chain-independent). */
export const ROBINHOOD_ERC6551_REGISTRY_ADDRESS =
  "0x000000006551c19487814612e58FE06813775758" as const;

/** Viem chain definition for Robinhood Chain testnet. */
export const robinhoodTestnet = defineChain({
  id: ROBINHOOD_TESTNET_CHAIN_ID,
  name: "Robinhood Chain Testnet",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.chain.robinhood.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Explorer",
      url: "https://explorer.testnet.chain.robinhood.com",
      apiUrl: "https://explorer.testnet.chain.robinhood.com/api/",
    },
  },
  testnet: true,
});

export const ROBINHOOD_TESTNET_NETWORK = {
  slug: ROBINHOOD_TESTNET_SLUG,
  name: "Robinhood Chain Testnet",
  chainId: ROBINHOOD_TESTNET_CHAIN_ID,
  caip2: ROBINHOOD_TESTNET_CAIP2,
  legacy: false,
  nativeGasAsset: {
    symbol: "ETH",
    decimals: 18,
    label: "test ETH (no real value)",
  },
  rpc: {
    primaryEnvKey: "ROBINHOOD_TESTNET_RPC_URL",
    publicEnvKey: "NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL",
  },
  publicRpcUrl: "https://rpc.testnet.chain.robinhood.com",
  explorer: {
    browserUrl: "https://explorer.testnet.chain.robinhood.com",
    apiUrl: "https://explorer.testnet.chain.robinhood.com/api/",
    name: "Robinhood Explorer",
  },
  faucet: "https://faucet.testnet.chain.robinhood.com",
  confirmation: {
    recommendWaitBlocks: 1,
    finalityModel: "arbitrum-nitro-l2",
    notes:
      "Treat a successful receipt as confirmed for testnet smoke. Do not assume Base Sepolia confirmation semantics.",
  },
  forbiddenMainnetChainId: FORBIDDEN_ROBINHOOD_MAINNET_CHAIN_ID,
  assets: [
    {
      id: "erc6551-registry",
      kind: "registry",
      status: "canonical",
      label: "ERC-6551 Token Bound Account Registry",
      address: ROBINHOOD_ERC6551_REGISTRY_ADDRESS,
    },
    {
      id: "erc6551-account-implementation",
      kind: "account-implementation",
      status: "test-asset-fallback",
      label: "Margin Call Test Asset — TBA account implementation (to deploy)",
      address: null,
    },
    {
      id: "usdg",
      kind: "payment-token",
      status: "test-asset-fallback",
      label: "Margin Call Test Asset — test USDG",
      address: null,
      decimalsHint: 6,
    },
    {
      id: "stock-token-aapl",
      kind: "stock-token",
      status: "test-asset-fallback",
      label: "Margin Call Test Asset — AAPL",
      address: null,
      ticker: "AAPL",
      decimalsHint: 18,
    },
    {
      id: "stock-token-nvda",
      kind: "stock-token",
      status: "test-asset-fallback",
      label: "Margin Call Test Asset — NVDA",
      address: null,
      ticker: "NVDA",
      decimalsHint: 18,
    },
    {
      id: "price-feed-aapl",
      kind: "price-feed",
      status: "test-asset-fallback",
      label: "Margin Call Test Asset — AAPL price feed",
      address: null,
      ticker: "AAPL",
    },
    {
      id: "price-feed-nvda",
      kind: "price-feed",
      status: "test-asset-fallback",
      label: "Margin Call Test Asset — NVDA price feed",
      address: null,
      ticker: "NVDA",
    },
    {
      id: "sequencer-uptime-feed",
      kind: "sequencer-uptime-feed",
      status: "test-asset-fallback",
      label: "Margin Call Test Asset — sequencer uptime feed",
      address: null,
    },
    {
      id: "erc8056-multiplier",
      kind: "interface-capability",
      status: "unverified",
      label: "ERC-8056 uiMultiplier support on Stock Tokens",
      address: null,
    },
    {
      id: "gas-sponsorship",
      kind: "infra",
      status: "unverified",
      label: "Privy gas sponsorship path",
      address: null,
    },
  ],
} as const satisfies NetworkConfig;
