import { describe, expect, it } from "vitest";
import { baseSepolia } from "viem/chains";
import {
  getPrivyAppId,
  getPrivyProviderProps,
  privyProviderConfig,
} from "@/lib/privy/config";

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

  it("requires a public Privy app ID", () => {
    expect(() => getPrivyAppId(undefined)).toThrow(
      "Missing NEXT_PUBLIC_PRIVY_APP_ID"
    );
    expect(getPrivyAppId("cm_test_app_id")).toBe("cm_test_app_id");
  });

  it("passes the validated app ID and focused configuration to the provider", () => {
    expect(getPrivyProviderProps("cm_test_app_id")).toEqual({
      appId: "cm_test_app_id",
      config: privyProviderConfig,
    });
  });
});
