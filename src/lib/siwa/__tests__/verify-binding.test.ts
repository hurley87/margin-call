import { describe, expect, it } from "vitest";
import { siwaAuthMatchesTrader } from "@/lib/siwa/binding";
import { siwaAuthMatchesConvexTrader } from "@/lib/siwa/binding";
import { getEmbeddedEvmWalletAddress } from "@/lib/privy/wallet";

describe("siwaAuthMatchesTrader", () => {
  it("returns true when SIWA agent and wallet match trader identity", () => {
    expect(
      siwaAuthMatchesTrader(
        {
          agentId: 42,
          address: "0x1111111111111111111111111111111111111111",
        },
        {
          token_id: 42,
          cdp_wallet_address: "0x1111111111111111111111111111111111111111",
        }
      )
    ).toBe(true);
  });

  it("returns false when token IDs differ", () => {
    expect(
      siwaAuthMatchesTrader(
        {
          agentId: 7,
          address: "0x1111111111111111111111111111111111111111",
        },
        {
          token_id: 8,
          cdp_wallet_address: "0x1111111111111111111111111111111111111111",
        }
      )
    ).toBe(false);
  });

  it("returns false when wallet addresses differ", () => {
    expect(
      siwaAuthMatchesTrader(
        {
          agentId: 42,
          address: "0x1111111111111111111111111111111111111111",
        },
        {
          token_id: 42,
          cdp_wallet_address: "0x2222222222222222222222222222222222222222",
        }
      )
    ).toBe(false);
  });
});

describe("siwaAuthMatchesConvexTrader", () => {
  it("requires the SIWA smart account and recovered CDP owner to match the trader", () => {
    expect(
      siwaAuthMatchesConvexTrader(
        {
          agentId: 42,
          address: "0x1111111111111111111111111111111111111111",
          signerAddress: "0x2222222222222222222222222222222222222222",
        },
        {
          tokenId: 42,
          cdpWalletAddress: "0x1111111111111111111111111111111111111111",
          cdpOwnerAddress: "0x2222222222222222222222222222222222222222",
        }
      )
    ).toBe(true);
  });

  it("rejects a matching smart account signed by the wrong CDP owner", () => {
    expect(
      siwaAuthMatchesConvexTrader(
        {
          agentId: 42,
          address: "0x1111111111111111111111111111111111111111",
          signerAddress: "0x3333333333333333333333333333333333333333",
        },
        {
          tokenId: 42,
          cdpWalletAddress: "0x1111111111111111111111111111111111111111",
          cdpOwnerAddress: "0x2222222222222222222222222222222222222222",
        }
      )
    ).toBe(false);
  });
});

describe("getEmbeddedEvmWalletAddress", () => {
  it("prefers the primary embedded EVM wallet address when present", () => {
    expect(
      getEmbeddedEvmWalletAddress({
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
      getEmbeddedEvmWalletAddress({
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

  it("ignores external wallets", () => {
    expect(
      getEmbeddedEvmWalletAddress({
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
    ).toBeNull();
  });

  it("returns null when no wallet is linked", () => {
    expect(
      getEmbeddedEvmWalletAddress({
        wallet: null,
        linkedAccounts: [{ type: "email" }],
      })
    ).toBeNull();
  });
});
