import type { PrivyClientConfig } from "@privy-io/react-auth";
import {
  PAYMENT_CHAIN,
  PAYMENT_CHAIN_ID,
  PAYMENT_CHAIN_ID_CAIP2,
  PAYMENT_CHAIN_NAME,
  PAYMENT_CHAIN_SLUG,
  PAYMENT_EXPLORER_URL,
  PAYMENT_PUBLIC_RPC_URL,
  isPaymentChainId,
  txExplorerUrl,
} from "@margin-call/shared";

export {
  PAYMENT_CHAIN,
  PAYMENT_CHAIN_ID,
  PAYMENT_CHAIN_ID_CAIP2,
  PAYMENT_CHAIN_NAME,
  PAYMENT_CHAIN_SLUG,
  PAYMENT_EXPLORER_URL,
  PAYMENT_PUBLIC_RPC_URL,
  txExplorerUrl,
};

/** @deprecated Prefer PAYMENT_CHAIN_ID — kept for call-site churn reduction. */
export const BASE_CHAIN_ID = PAYMENT_CHAIN_ID;
/** @deprecated Prefer PAYMENT_CHAIN_ID_CAIP2. */
export const BASE_CHAIN_ID_CAIP2 = PAYMENT_CHAIN_ID_CAIP2;

/** True when `chainId` is the active Floor payment chain. */
export function isChainIdBase(chainId: string | number): boolean {
  return isPaymentChainId(chainId);
}

export const privyConfig: PrivyClientConfig = {
  loginMethods: ["email", "wallet"],
  appearance: {
    theme: "dark",
    accentColor: "#d6a660",
    walletList: [
      "detected_wallets",
      "metamask",
      "coinbase_wallet",
      "wallet_connect",
    ],
  },
  embeddedWallets: {
    ethereum: {
      createOnLogin: "users-without-wallets",
    },
  },
  defaultChain: PAYMENT_CHAIN,
  supportedChains: [PAYMENT_CHAIN],
};
