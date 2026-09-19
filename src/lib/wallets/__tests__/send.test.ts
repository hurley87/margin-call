import { describe, expect, it, vi } from "vitest";
import { createDynamicAgentWallet } from "@/lib/wallets/dynamic-server";

const ADDRESS = "0xBe523e724B9Ea7D618dD093f14618D90c4B19b0c" as const;
const TO = "0x1234567890abcdef1234567890abcdef12345678" as const;
const HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const SIGNED =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;

const walletMetadata = {
  walletId: "wallet-1",
  accountAddress: ADDRESS,
  chainName: "EVM",
  thresholdSignatureScheme: "TWO_OF_TWO",
  externalServerKeySharesBackupInfo: { location: "dynamic" },
};

describe("createDynamicAgentWallet", () => {
  it("signs through Dynamic, broadcasts on Base, and waits for the receipt", async () => {
    const prepared = { to: TO, value: 0n, chainId: 8453 };
    const signTransaction = vi.fn(async () => SIGNED);
    const signTypedData = vi.fn(async () => SIGNED);
    const prepareTransactionRequest = vi.fn(async () => prepared);
    const sendRawTransaction = vi.fn(async () => HASH);
    const waitForTransactionReceipt = vi.fn(async () => ({
      status: "success" as const,
      blockNumber: 12n,
      transactionHash: HASH,
    }));

    const wallet = createDynamicAgentWallet({
      client: { signTransaction, signTypedData },
      publicClient: {
        prepareTransactionRequest,
        sendRawTransaction,
        waitForTransactionReceipt,
      },
      walletMetadata,
      password: "test-password",
    });

    expect(wallet.address).toBe(ADDRESS);

    const hash = await wallet.sendTransaction({ to: TO, value: 0n });
    expect(hash).toBe(HASH);
    expect(signTransaction).toHaveBeenCalledWith({
      walletMetadata,
      password: "test-password",
      transaction: prepared,
    });
    expect(signTransaction).toHaveBeenCalledTimes(1);
    const signArgs = signTransaction.mock.calls.at(0)?.at(0) as
      { externalServerKeyShares?: unknown } | undefined;
    expect(signArgs).not.toHaveProperty("externalServerKeyShares");
    expect(sendRawTransaction).toHaveBeenCalledWith({
      serializedTransaction: SIGNED,
    });

    await expect(wallet.waitForReceipt(hash)).resolves.toEqual({
      hash: HASH,
      status: "success",
      blockNumber: 12n,
    });
  });

  it("signs Permit2 typed data through Dynamic without caller-supplied key shares", async () => {
    const signTransaction = vi.fn(async () => SIGNED);
    const signTypedData = vi.fn(async () => SIGNED);
    const wallet = createDynamicAgentWallet({
      client: { signTransaction, signTypedData },
      publicClient: {
        prepareTransactionRequest: vi.fn(),
        sendRawTransaction: vi.fn(),
        waitForTransactionReceipt: vi.fn(),
      },
      walletMetadata,
      password: "test-password",
    });

    const typedData = {
      domain: { name: "Permit2", chainId: 8453 },
      types: { PermitSingle: [{ name: "spender", type: "address" as const }] },
      primaryType: "PermitSingle",
      message: { spender: TO },
    };

    await expect(wallet.signTypedData(typedData)).resolves.toBe(SIGNED);
    expect(signTypedData).toHaveBeenCalledWith({
      walletMetadata,
      password: "test-password",
      typedData,
    });
    const signArgs = signTypedData.mock.calls.at(0)?.at(0) as
      { externalServerKeyShares?: unknown } | undefined;
    expect(signArgs).not.toHaveProperty("externalServerKeyShares");
  });
});
