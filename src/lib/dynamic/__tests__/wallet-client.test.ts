import type { WalletAccount } from "@dynamic-labs-sdk/client";
import { describe, expect, it, vi } from "vitest";
import { getBaseWalletClient } from "@/lib/dynamic/wallet-client";

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

const EVM_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const SIGNATURE =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1b";

function mockEip1193Provider() {
  return {
    request: vi.fn(async ({ method }: { method: string }) => {
      switch (method) {
        case "eth_chainId":
          return "0x2105";
        case "personal_sign":
          return SIGNATURE;
        default:
          throw new Error(`Unexpected method: ${method}`);
      }
    }),
  };
}

describe("getBaseWalletClient", () => {
  it("returns null when there is no valid EVM account or provider", () => {
    const provider = mockEip1193Provider();

    expect(getBaseWalletClient({ accounts: [], provider })).toBeNull();
    expect(
      getBaseWalletClient({
        accounts: [
          account({
            chain: "SOL",
            address: "So11111111111111111111111111111111111111112",
            walletProviderKey: "phantom",
          }),
        ],
        provider,
      })
    ).toBeNull();
    expect(
      getBaseWalletClient({
        accounts: [account({ chain: "EVM", address: "0xZZ" })],
        provider,
      })
    ).toBeNull();
    expect(
      getBaseWalletClient({
        accounts: [account({ chain: "EVM", address: EVM_ADDRESS })],
        provider: null,
      })
    ).toBeNull();
    expect(
      getBaseWalletClient({
        accounts: [account({ chain: "EVM", address: EVM_ADDRESS })],
        provider: {},
      })
    ).toBeNull();
  });

  it("returns a Base (8453) WalletClient for a connected EVM wallet", () => {
    const provider = mockEip1193Provider();
    const client = getBaseWalletClient({
      accounts: [account({ chain: "EVM", address: EVM_ADDRESS })],
      provider,
    });

    expect(client).not.toBeNull();
    expect(client!.chain.id).toBe(8453);
    expect(client!.account.address.toLowerCase()).toBe(
      EVM_ADDRESS.toLowerCase()
    );
  });

  it("can request a user signature through the EIP-1193 transport", async () => {
    const provider = mockEip1193Provider();
    const client = getBaseWalletClient({
      accounts: [account({ chain: "EVM", address: EVM_ADDRESS })],
      provider,
    });

    expect(client).not.toBeNull();

    const signature = await client!.signMessage({ message: "margin-call" });

    expect(signature).toBe(SIGNATURE);
    expect(provider.request).toHaveBeenCalled();
    expect(
      provider.request.mock.calls.some(
        ([args]) => args.method === "personal_sign"
      )
    ).toBe(true);
  });
});
