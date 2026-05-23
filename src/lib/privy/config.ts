import type { PrivyClientConfig } from "@privy-io/react-auth";
import { base, baseSepolia } from "viem/chains";

export const PAYMENT_CHAIN = baseSepolia;
export const PAYMENT_CHAIN_NAME = PAYMENT_CHAIN.name;
export const BASE_CHAIN_ID = PAYMENT_CHAIN.id;
export const BASE_CHAIN_ID_CAIP2 = `eip155:${BASE_CHAIN_ID}` as const;

/** True when `chainId` is the configured payment chain (numeric id, numeric string, or CAIP-2). */
export function isChainIdBase(chainId: string | number): boolean {
  if (typeof chainId === "number") return chainId === BASE_CHAIN_ID;
  return chainId === BASE_CHAIN_ID_CAIP2 || chainId === String(BASE_CHAIN_ID);
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
  supportedChains: [PAYMENT_CHAIN, base],
};
