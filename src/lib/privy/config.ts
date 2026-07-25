import type { PrivyClientConfig } from "@privy-io/react-auth";
import {
  getActiveNetwork,
  getActiveViemChain,
  isActiveChainId,
} from "@/lib/network";

const active = getActiveNetwork();

/** Floor payment chain — Robinhood Chain testnet. */
export const PAYMENT_CHAIN = getActiveViemChain();
export const PAYMENT_CHAIN_NAME = PAYMENT_CHAIN.name;
export const PAYMENT_CHAIN_ID = active.chainId;
export const PAYMENT_CHAIN_ID_CAIP2 = active.caip2;

/** @deprecated Prefer PAYMENT_CHAIN_ID — kept for call-site churn reduction. */
export const BASE_CHAIN_ID = PAYMENT_CHAIN_ID;
/** @deprecated Prefer PAYMENT_CHAIN_ID_CAIP2. */
export const BASE_CHAIN_ID_CAIP2 = PAYMENT_CHAIN_ID_CAIP2;

/** True when `chainId` is the active Floor payment chain. */
export function isChainIdBase(chainId: string | number): boolean {
  return isActiveChainId(chainId);
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
