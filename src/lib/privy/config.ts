import type { PrivyClientConfig } from "@privy-io/react-auth";
import { base } from "viem/chains";

/** Base mainnet chain ID (number). Use for switchChain and comparisons. */
export const BASE_CHAIN_ID = base.id;

/** CAIP-2 chain id for Base (e.g. from Privy wallet.chainId). */
export const BASE_CHAIN_ID_CAIP2 = `eip155:${BASE_CHAIN_ID}` as const;

/**
 * Returns true if the given chain id (number or CAIP-2 string) is Base mainnet.
 */
export function isChainIdBase(chainId: string | number): boolean {
  if (typeof chainId === "number") return chainId === BASE_CHAIN_ID;
  return chainId === BASE_CHAIN_ID_CAIP2 || chainId === String(BASE_CHAIN_ID);
}

export const privyConfig: PrivyClientConfig = {
  loginMethods: ["wallet", "email", "google", "twitter"],
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
  defaultChain: base,
  supportedChains: [base],
};
