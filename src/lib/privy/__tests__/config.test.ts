import { describe, expect, it } from "vitest";
import { baseSepolia } from "viem/chains";
import { privyProviderConfig } from "@/lib/privy/config";

describe("Privy provider configuration", () => {
  it("limits authentication to SMS and embedded Ethereum wallets on Base Sepolia", () => {
    expect(privyProviderConfig).toMatchObject({
      loginMethods: ["sms"],
      defaultChain: baseSepolia,
      supportedChains: [baseSepolia],
      embeddedWallets: {
        ethereum: {
          createOnLogin: "all-users",
        },
      },
    });
  });
});
