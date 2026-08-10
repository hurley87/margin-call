import { describe, expect, it } from "vitest";
import { getEvmWalletAddress } from "@/lib/privy/wallet";

describe("getEvmWalletAddress", () => {
  it("prefers the primary embedded EVM wallet address when present", () => {
    expect(
      getEvmWalletAddress({
        wallet: {
          type: "wallet",
          address: "0xabc",
          chainType: "ethereum",
          walletClientType: "privy",
        },
        linkedAccounts: [
          {
            type: "wallet",
            address: "0xdef",
            chainType: "ethereum",
            walletClientType: "privy",
          },
        ],
      })
    ).toBe("0xabc");
  });

  it("falls back to linked embedded EVM wallet address", () => {
    expect(
      getEvmWalletAddress({
        wallet: null,
        linkedAccounts: [
          {
            type: "wallet",
            address: "0xdef",
            chainType: "ethereum",
            walletClientType: "privy-v2",
          },
        ],
      })
    ).toBe("0xdef");
  });

  it("prefers an embedded wallet over a linked external wallet", () => {
    expect(
      getEvmWalletAddress({
        wallet: {
          type: "wallet",
          address: "0xext",
          chainType: "ethereum",
          walletClientType: "metamask",
        },
        linkedAccounts: [
          {
            type: "wallet",
            address: "0xembedded",
            chainType: "ethereum",
            walletClientType: "privy",
          },
        ],
      })
    ).toBe("0xembedded");
  });

  it("falls back to an external EVM wallet when no embedded wallet exists", () => {
    expect(
      getEvmWalletAddress({
        wallet: null,
        linkedAccounts: [
          {
            type: "wallet",
            address: "0xdef",
            chainType: "ethereum",
            walletClientType: "metamask",
          },
        ],
      })
    ).toBe("0xdef");
  });

  it("returns null when no wallet is linked", () => {
    expect(
      getEvmWalletAddress({
        wallet: null,
        linkedAccounts: [{ type: "email" }],
      })
    ).toBeNull();
  });
});
