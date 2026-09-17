import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  switchActiveNetworkMock,
  addNetworkMock,
  createWalletClientForWalletAccountMock,
  isEvmWalletAccountMock,
  NetworkNotAddedErrorMock,
} = vi.hoisted(() => {
  class NetworkNotAddedError extends Error {
    networkData: { networkId: string };

    constructor(networkData: { networkId: string }) {
      super("Network not added");
      this.name = "NetworkNotAddedError";
      this.networkData = networkData;
    }
  }

  return {
    switchActiveNetworkMock: vi.fn(),
    addNetworkMock: vi.fn(),
    createWalletClientForWalletAccountMock: vi.fn(),
    isEvmWalletAccountMock: vi.fn(),
    NetworkNotAddedErrorMock: NetworkNotAddedError,
  };
});

vi.mock("@dynamic-labs-sdk/client", () => ({
  switchActiveNetwork: switchActiveNetworkMock,
  addNetwork: addNetworkMock,
  NetworkNotAddedError: NetworkNotAddedErrorMock,
}));

vi.mock("@dynamic-labs-sdk/evm", () => ({
  isEvmWalletAccount: isEvmWalletAccountMock,
}));

vi.mock("@dynamic-labs-sdk/evm/viem", () => ({
  createWalletClientForWalletAccount: createWalletClientForWalletAccountMock,
}));

import {
  BASE_NETWORK_ID,
  createBaseWalletClient,
  getEvmWalletAddress,
  truncateAddress,
} from "@/lib/dynamic/wallet";

describe("getEvmWalletAddress", () => {
  it("returns the first EVM address", () => {
    expect(
      getEvmWalletAddress([
        {
          chain: "SOL",
          address: "So11111111111111111111111111111111111111112",
        },
        {
          chain: "EVM",
          address: "0x1234567890abcdef1234567890abcdef12345678",
        },
      ])
    ).toBe("0x1234567890abcdef1234567890abcdef12345678");
  });

  it("returns null when there is no EVM account", () => {
    expect(getEvmWalletAddress([])).toBeNull();
    expect(getEvmWalletAddress([{ chain: "SOL", address: "abc" }])).toBeNull();
    expect(getEvmWalletAddress(null)).toBeNull();
  });
});

describe("truncateAddress", () => {
  it("shortens an EVM address for display", () => {
    expect(truncateAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe(
      "0x1234…5678"
    );
  });
});

describe("createBaseWalletClient", () => {
  const walletAccount = {
    address: "0x1234567890abcdef1234567890abcdef12345678",
    chain: "EVM",
    id: "account-1",
    lastSelectedAt: null,
    verifiedCredentialId: null,
    walletProviderKey: "metamaskevm",
  };

  beforeEach(() => {
    switchActiveNetworkMock.mockReset();
    addNetworkMock.mockReset();
    createWalletClientForWalletAccountMock.mockReset();
    isEvmWalletAccountMock.mockReset();
    isEvmWalletAccountMock.mockReturnValue(true);
    createWalletClientForWalletAccountMock.mockResolvedValue({
      account: walletAccount.address,
    });
  });

  it("switches to Base and returns a viem wallet client", async () => {
    const client = await createBaseWalletClient(walletAccount as never);

    expect(switchActiveNetworkMock).toHaveBeenCalledWith({
      walletAccount,
      networkId: BASE_NETWORK_ID,
    });
    expect(createWalletClientForWalletAccountMock).toHaveBeenCalledWith({
      walletAccount,
    });
    expect(client).toEqual({ account: walletAccount.address });
  });

  it("adds Base then retries when the network is missing", async () => {
    const networkData = { networkId: BASE_NETWORK_ID };
    switchActiveNetworkMock
      .mockRejectedValueOnce(new NetworkNotAddedErrorMock(networkData))
      .mockResolvedValueOnce(undefined);

    await createBaseWalletClient(walletAccount as never);

    expect(addNetworkMock).toHaveBeenCalledWith({
      walletAccount,
      networkData,
    });
    expect(switchActiveNetworkMock).toHaveBeenCalledTimes(2);
    expect(createWalletClientForWalletAccountMock).toHaveBeenCalled();
  });
});
