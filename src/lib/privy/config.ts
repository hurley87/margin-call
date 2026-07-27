import type { PrivyClientConfig } from "@privy-io/react-auth";
import { defineChain } from "viem";

/** Robinhood Chain testnet — Floor payment chain after network-module teardown. */
export const PAYMENT_CHAIN_ID = 46630 as const;
export const PAYMENT_CHAIN_ID_CAIP2 = "eip155:46630" as const;
export const PAYMENT_CHAIN_NAME = "Robinhood Chain Testnet";
export const PAYMENT_CHAIN_SLUG = "robinhood-testnet" as const;
export const PAYMENT_PUBLIC_RPC_URL =
  "https://rpc.testnet.chain.robinhood.com" as const;
export const PAYMENT_EXPLORER_URL =
  "https://explorer.testnet.chain.robinhood.com" as const;

export const PAYMENT_CHAIN = defineChain({
  id: PAYMENT_CHAIN_ID,
  name: PAYMENT_CHAIN_NAME,
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [PAYMENT_PUBLIC_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Explorer",
      url: PAYMENT_EXPLORER_URL,
      apiUrl: `${PAYMENT_EXPLORER_URL}/api/`,
    },
  },
  testnet: true,
});

/** @deprecated Prefer PAYMENT_CHAIN_ID — kept for call-site churn reduction. */
export const BASE_CHAIN_ID = PAYMENT_CHAIN_ID;
/** @deprecated Prefer PAYMENT_CHAIN_ID_CAIP2. */
export const BASE_CHAIN_ID_CAIP2 = PAYMENT_CHAIN_ID_CAIP2;

/** True when `chainId` is the active Floor payment chain. */
export function isChainIdBase(chainId: string | number): boolean {
  if (typeof chainId === "number") return chainId === PAYMENT_CHAIN_ID;
  if (chainId === PAYMENT_CHAIN_ID_CAIP2) return true;
  if (chainId === String(PAYMENT_CHAIN_ID)) return true;
  const caipMatch = /^eip155:(\d+)$/.exec(chainId);
  if (caipMatch) return Number(caipMatch[1]) === PAYMENT_CHAIN_ID;
  return false;
}

export function txExplorerUrl(txHash: string): string {
  return `${PAYMENT_EXPLORER_URL}/tx/${txHash}`;
}

export const privyConfig: PrivyClientConfig = {
  loginMethods: ["email"],
  appearance: {
    theme: "dark",
    accentColor: "#d6a660",
  },
  embeddedWallets: {
    ethereum: {
      createOnLogin: "users-without-wallets",
    },
  },
  defaultChain: PAYMENT_CHAIN,
  supportedChains: [PAYMENT_CHAIN],
};
