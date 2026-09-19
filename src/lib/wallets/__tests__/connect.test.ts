import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DynamicServerWalletEnv } from "@/lib/wallets/config";

const {
  authenticateApiToken,
  createWalletAccount,
  signTransaction,
  signTypedData,
} = vi.hoisted(() => ({
  authenticateApiToken: vi.fn(),
  createWalletAccount: vi.fn(),
  signTransaction: vi.fn(),
  signTypedData: vi.fn(),
}));

vi.mock("@dynamic-labs-wallet/node", () => ({
  ThresholdSignatureScheme: { TWO_OF_TWO: "TWO_OF_TWO" },
}));

vi.mock("@dynamic-labs-wallet/node-evm", () => ({
  DynamicEvmWalletClient: vi.fn(function MockDynamicEvmWalletClient() {
    return {
      authenticateApiToken,
      createWalletAccount,
      signTransaction,
      signTypedData,
    };
  }),
}));

import { DynamicEvmWalletClient } from "@dynamic-labs-wallet/node-evm";
import { connectDynamicServerWallet } from "@/lib/wallets/connect";

const ENV: DynamicServerWalletEnv = {
  environmentId: "env_abc",
  apiToken: "dyn_token_must_not_print",
  walletPassword: "backup-password-must-not-print",
  storePath: ".dynamic-agent-wallet.json",
  rpcUrl: "https://mainnet.base.org",
};

describe("connectDynamicServerWallet", () => {
  beforeEach(() => {
    vi.mocked(DynamicEvmWalletClient).mockClear();
    authenticateApiToken.mockReset().mockResolvedValue(undefined);
    createWalletAccount.mockReset();
    signTransaction.mockReset();
    signTypedData.mockReset();
  });

  it("constructs the Dynamic client with the MPC accelerator disabled", async () => {
    await connectDynamicServerWallet(ENV);

    expect(DynamicEvmWalletClient).toHaveBeenCalledTimes(1);
    expect(DynamicEvmWalletClient).toHaveBeenCalledWith({
      environmentId: "env_abc",
      enableMPCAccelerator: false,
    });
    expect(authenticateApiToken).toHaveBeenCalledWith(ENV.apiToken);
  });

  it("surfaces signing failures without leaking credentials", async () => {
    signTransaction.mockRejectedValue(
      new Error(
        `ceremony failed token=${ENV.apiToken} password=${ENV.walletPassword}`
      )
    );
    const client = await connectDynamicServerWallet(ENV);

    let message = "";
    try {
      await client.signTransaction({
        walletMetadata: {
          walletId: "wallet-1",
          accountAddress: "0xBe523e724B9Ea7D618dD093f14618D90c4B19b0c",
          chainName: "EVM",
          thresholdSignatureScheme: "TWO_OF_TWO",
        },
        password: ENV.walletPassword,
        transaction: { to: "0xBe523e724B9Ea7D618dD093f14618D90c4B19b0c" },
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/could not recover signing capability/i);
    expect(message).not.toContain(ENV.apiToken);
    expect(message).not.toContain(ENV.walletPassword);
    expect(message).toContain("[redacted]");
  });
});
