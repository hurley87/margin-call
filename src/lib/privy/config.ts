import type { PrivyClientConfig } from "@privy-io/react-auth";
import { baseSepolia } from "viem/chains";

export const privyProviderConfig = {
  loginMethods: ["sms"],
  defaultChain: baseSepolia,
  supportedChains: [baseSepolia],
  embeddedWallets: {
    ethereum: {
      createOnLogin: "all-users",
    },
  },
} satisfies PrivyClientConfig;

export function getPrivyAppId(appId: string | undefined): string {
  if (!appId) {
    throw new Error(
      "Missing NEXT_PUBLIC_PRIVY_APP_ID. Set it to the Privy app ID before starting Margin Call."
    );
  }

  return appId;
}

export function getPrivyProviderProps(appId: string | undefined) {
  return {
    appId: getPrivyAppId(appId),
    config: privyProviderConfig,
  };
}
