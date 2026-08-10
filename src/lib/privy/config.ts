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
