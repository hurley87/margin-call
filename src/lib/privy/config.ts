import type { PrivyClientConfig } from "@privy-io/react-auth";
import { base, baseSepolia } from "viem/chains";

export const PAYMENT_CHAIN = baseSepolia;
export const PAYMENT_CHAIN_NAME = PAYMENT_CHAIN.name;

/** Payment chain id (number). Use for switchChain and comparisons. */
export const BASE_CHAIN_ID = PAYMENT_CHAIN.id;

/** CAIP-2 chain id for the payment chain. */
export const BASE_CHAIN_ID_CAIP2 = `eip155:${BASE_CHAIN_ID}` as const;

/**
 * Returns true if the given chain id (number or CAIP-2 string) matches the payment chain.
 */
export function isChainIdBase(chainId: string | number): boolean {
  if (typeof chainId === "number") return chainId === BASE_CHAIN_ID;
  return chainId === BASE_CHAIN_ID_CAIP2 || chainId === String(BASE_CHAIN_ID);
}

export const privyConfig: PrivyClientConfig = {
  loginMethods: ["wallet"],
  appearance: {
    theme: "dark",
    accentColor: "#22c55e",
    logo: undefined,
  },
  embeddedWallets: {
    ethereum: {
      createOnLogin: "users-without-wallets",
    },
  },
  defaultChain: PAYMENT_CHAIN,
  supportedChains: [PAYMENT_CHAIN, base],
};
