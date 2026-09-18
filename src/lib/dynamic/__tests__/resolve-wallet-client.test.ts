import type { WalletAccount } from "@dynamic-labs-sdk/client";
import { NetworkNotAddedError } from "@dynamic-labs-sdk/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { switchActiveNetworkMock, addNetworkMock } = vi.hoisted(() => ({
  switchActiveNetworkMock: vi.fn(),
  addNetworkMock: vi.fn(),
}));

vi.mock("@dynamic-labs-sdk/client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@dynamic-labs-sdk/client")>();
  return {
    ...actual,
    switchActiveNetwork: switchActiveNetworkMock,
    addNetwork: addNetworkMock,
  };
});

import {
  BASE_NETWORK_ID,
  parseNetworkIdToChainId,
  switchWalletToBase,
} from "@/lib/dynamic/resolve-wallet-client";

function account(): WalletAccount {
  return {
    id: "account-1",
    chain: "EVM",
    address: "0x1234567890abcdef1234567890abcdef12345678",
    lastSelectedAt: null,
    verifiedCredentialId: null,
    walletProviderKey: "metamaskevm",
  } as WalletAccount;
}

const baseNetworkData = {
  chainName: "Base",
  networkId: BASE_NETWORK_ID,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
};

describe("parseNetworkIdToChainId", () => {
  it("parses Dynamic network id formats", () => {
    expect(parseNetworkIdToChainId("8453")).toBe(8453);
    expect(parseNetworkIdToChainId("eip155:8453")).toBe(8453);
    expect(parseNetworkIdToChainId("0x2105")).toBe(8453);
    expect(parseNetworkIdToChainId(null)).toBeNull();
    expect(parseNetworkIdToChainId("")).toBeNull();
  });
});

describe("switchWalletToBase", () => {
  beforeEach(() => {
    switchActiveNetworkMock.mockReset();
    addNetworkMock.mockReset();
  });

  it("switches when Base is already in the wallet", async () => {
    switchActiveNetworkMock.mockResolvedValue(undefined);
    const walletAccount = account();

    await switchWalletToBase(walletAccount);

    expect(switchActiveNetworkMock).toHaveBeenCalledTimes(1);
    expect(switchActiveNetworkMock).toHaveBeenCalledWith({
      walletAccount,
      networkId: BASE_NETWORK_ID,
    });
    expect(addNetworkMock).not.toHaveBeenCalled();
  });

  it("adds Base then switches on NetworkNotAddedError", async () => {
    const walletAccount = account();
    const notAdded = new NetworkNotAddedError({
      networkData: baseNetworkData as never,
      networkId: BASE_NETWORK_ID,
      originalError: new Error("chain missing"),
      walletProviderKey: "metamaskevm",
    });
    switchActiveNetworkMock
      .mockRejectedValueOnce(notAdded)
      .mockResolvedValueOnce(undefined);
    addNetworkMock.mockResolvedValue(undefined);

    await switchWalletToBase(walletAccount);

    expect(addNetworkMock).toHaveBeenCalledWith({
      walletAccount,
      networkData: notAdded.networkData,
    });
    expect(switchActiveNetworkMock).toHaveBeenCalledTimes(2);
  });

  it("rethrows non-NetworkNotAddedError failures", async () => {
    switchActiveNetworkMock.mockRejectedValue(new Error("user rejected"));

    await expect(switchWalletToBase(account())).rejects.toThrow(
      "user rejected"
    );
    expect(addNetworkMock).not.toHaveBeenCalled();
  });
});
