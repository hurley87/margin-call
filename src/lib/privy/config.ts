import type { PrivyClientConfig } from "@privy-io/react-auth";
import {
  BASE_SEPOLIA_CAIP2,
  BASE_SEPOLIA_CHAIN_ID,
  CONTRACTS_CHAIN,
  isBaseSepoliaChainId,
} from "@/lib/network";

export const PAYMENT_CHAIN = CONTRACTS_CHAIN;
export const PAYMENT_CHAIN_NAME = PAYMENT_CHAIN.name;
export const BASE_CHAIN_ID = BASE_SEPOLIA_CHAIN_ID;
export const BASE_CHAIN_ID_CAIP2 = BASE_SEPOLIA_CAIP2;

/** True when `chainId` is the configured payment chain (numeric id, numeric string, or CAIP-2). */
export function isChainIdBase(chainId: string | number): boolean {
  return isBaseSepoliaChainId(chainId);
}

export const privyConfig: PrivyClientConfig = {
  loginMethods: ["email"],
  appearance: {
    theme: "dark",
    accentColor: "#22c55e",
  },
  embeddedWallets: {
    ethereum: {
      createOnLogin: "users-without-wallets",
    },
  },
  defaultChain: PAYMENT_CHAIN,
  supportedChains: [PAYMENT_CHAIN],
};
