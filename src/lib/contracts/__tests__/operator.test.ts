import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createWalletClient: vi.fn(),
  http: vi.fn(),
  privateKeyToAccount: vi.fn(),
  makePublicClient: vi.fn(),
  writeContract: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createWalletClient: mocks.createWalletClient,
    http: mocks.http,
    nonceManager: {},
  };
});

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: mocks.privateKeyToAccount,
}));

vi.mock("@/lib/contracts/client", () => ({
  baseSepoliaRpcUrl: "https://example-rpc.test",
  makePublicClient: mocks.makePublicClient,
}));

describe("sendOperatorContractCall", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.OPERATOR_PRIVATE_KEY = "0xabc";

    mocks.privateKeyToAccount.mockReturnValue({ address: "0xoperator" });
    mocks.createWalletClient.mockReturnValue({
      writeContract: mocks.writeContract,
    });
    mocks.makePublicClient.mockReturnValue({
      waitForTransactionReceipt: mocks.waitForTransactionReceipt,
    });
    mocks.writeContract.mockResolvedValue("0xhash");
    mocks.waitForTransactionReceipt.mockResolvedValue({
      transactionHash: "0xconfirmed",
    });
  });

  it("writes operator-only calls from the server operator wallet", async () => {
    const { sendOperatorContractCall } = await import("../operator");

    await expect(
      sendOperatorContractCall({
        address: "0x0000000000000000000000000000000000000001",
        abi: [
          {
            type: "function",
            name: "enterDeal",
            inputs: [
              { name: "dealId", type: "uint256" },
              { name: "traderId", type: "uint256" },
            ],
            outputs: [],
            stateMutability: "nonpayable",
          },
        ],
        functionName: "enterDeal",
        args: [BigInt(1), BigInt(2)],
      })
    ).resolves.toEqual({ transactionHash: "0xconfirmed" });

    expect(mocks.createWalletClient).toHaveBeenCalledOnce();
    expect(mocks.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "0x0000000000000000000000000000000000000001",
        functionName: "enterDeal",
        args: [BigInt(1), BigInt(2)],
      })
    );
    expect(mocks.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: "0xhash",
    });
  });
});
