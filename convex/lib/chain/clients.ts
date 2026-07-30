import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";

const ROBINHOOD_TESTNET = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.chain.robinhood.com"] },
  },
  testnet: true,
});

export function getRpcUrl(): string {
  return (
    process.env.ROBINHOOD_TESTNET_RPC_URL?.trim() ||
    "https://rpc.testnet.chain.robinhood.com"
  );
}

export function createChainPublicClient(): PublicClient {
  return createPublicClient({
    chain: ROBINHOOD_TESTNET,
    transport: http(getRpcUrl()),
  });
}

export function parsePrivateKey(raw: string): Hex {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Private key is empty");
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(withPrefix)) {
    throw new Error("Private key must be a 0x-prefixed 32-byte hex string");
  }
  return withPrefix as Hex;
}

export function createMinterWalletClient(privateKey: Hex): WalletClient {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: ROBINHOOD_TESTNET,
    transport: http(getRpcUrl()),
  });
}
