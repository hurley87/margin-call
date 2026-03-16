import { describe, expect, it } from "vitest";
import { siwaAuthMatchesTrader } from "@/lib/siwa/binding";
import { getPrivyWalletAddress } from "@/lib/privy/server";

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

describe("getPrivyWalletAddress", () => {
  it("prefers the primary wallet address when present", () => {
    expect(
      getPrivyWalletAddress({
        wallet: { address: "0xabc" },
        linkedAccounts: [{ type: "wallet", address: "0xdef" }],
      })
    ).toBe("0xabc");
  });

  it("falls back to linked wallet address", () => {
    expect(
      getPrivyWalletAddress({
        wallet: null,
        linkedAccounts: [{ type: "wallet", address: "0xdef" }],
      })
    ).toBe("0xdef");
  });

  it("returns null when no wallet is linked", () => {
    expect(
      getPrivyWalletAddress({
        wallet: null,
        linkedAccounts: [{ type: "email" }],
      })
    ).toBeNull();
  });
});
