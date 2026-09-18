import type { WalletAccount } from "@dynamic-labs-sdk/client";
import { describe, expect, it } from "vitest";
import { getEvmWalletAddress } from "@/lib/dynamic/wallet";

/** Loose fixture helper — WalletAccount is EVM-narrowed once the EVM extension is loaded. */
function account(overrides: {
  address: string;
  chain: string;
  walletProviderKey?: string;
}): WalletAccount {
  return {
    id: "account-1",
    lastSelectedAt: null,
    verifiedCredentialId: null,
    walletProviderKey: "metamaskevm",
    ...overrides,
  } as WalletAccount;
}

describe("getEvmWalletAddress", () => {
  it("returns the first EVM address", () => {
    expect(
      getEvmWalletAddress([
        account({
          chain: "SOL",
          address: "So11111111111111111111111111111111111111112",
          walletProviderKey: "phantom",
        }),
        account({
          chain: "EVM",
          address: "0x1234567890abcdef1234567890abcdef12345678",
        }),
      ])
    ).toBe("0x1234567890abcdef1234567890abcdef12345678");
  });

  it("returns null when there is no EVM account", () => {
    expect(getEvmWalletAddress([])).toBeNull();
    expect(
      getEvmWalletAddress([
        account({ chain: "SOL", address: "abc", walletProviderKey: "phantom" }),
      ])
    ).toBeNull();
  });

  it("rejects an EVM account whose address is not a valid hex address", () => {
    expect(
      getEvmWalletAddress([account({ chain: "EVM", address: "0xZZ" })])
    ).toBeNull();
  });
});
