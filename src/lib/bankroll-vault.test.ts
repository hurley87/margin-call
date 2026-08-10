import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ readContract: vi.fn() }));

vi.mock("./base-sepolia", () => ({
  baseSepoliaPublicClient: {
    readContract: (...args: unknown[]) => sdk.readContract(...args),
  },
}));

describe("Bankroll Vault public configuration and reads", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    sdk.readContract.mockReset();
  });

  it("requires statically named valid public tUSD and vault addresses", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_DESK_DOLLARS_ADDRESS",
      "0x0000000000000000000000000000000000000001"
    );
    vi.stubEnv(
      "NEXT_PUBLIC_BANKROLL_VAULT_ADDRESS",
      "0x0000000000000000000000000000000000000002"
    );
    const { getBankrollVaultConfig } = await import("./bankroll-vault");
    expect(getBankrollVaultConfig()).toEqual({
      tokenAddress: "0x0000000000000000000000000000000000000001",
      vaultAddress: "0x0000000000000000000000000000000000000002",
    });
  });

  it("degrades safely for missing or invalid public configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_DESK_DOLLARS_ADDRESS", "invalid");
    vi.stubEnv("NEXT_PUBLIC_BANKROLL_VAULT_ADDRESS", "");
    const { getBankrollVaultConfig } = await import("./bankroll-vault");
    expect(getBankrollVaultConfig()).toBeNull();
  });

  it("reads the complete authoritative withdrawal state from the configured vault", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_DESK_DOLLARS_ADDRESS",
      "0x0000000000000000000000000000000000000001"
    );
    vi.stubEnv(
      "NEXT_PUBLIC_BANKROLL_VAULT_ADDRESS",
      "0x0000000000000000000000000000000000000002"
    );
    sdk.readContract
      .mockResolvedValueOnce(1n)
      .mockResolvedValueOnce(2n)
      .mockResolvedValueOnce(3n)
      .mockResolvedValueOnce(4n)
      .mockResolvedValueOnce(5n)
      .mockResolvedValueOnce(6n)
      .mockResolvedValueOnce(7n)
      .mockResolvedValueOnce(8n)
      .mockResolvedValueOnce(9n)
      .mockResolvedValueOnce(10n)
      .mockResolvedValueOnce(11n)
      .mockResolvedValueOnce(12n)
      .mockResolvedValueOnce(13n);
    const { getBankrollVaultConfig, readBankrollVaultState } =
      await import("./bankroll-vault");
    const config = getBankrollVaultConfig()!;
    await expect(
      readBankrollVaultState(
        config,
        "0x0000000000000000000000000000000000000003"
      )
    ).resolves.toMatchObject({
      reservedLiabilities: 10n,
      safetyBuffer: 11n,
      freeLiquidity: 12n,
      maxWithdraw: 13n,
    });
    expect(sdk.readContract).toHaveBeenCalledTimes(13);
    expect(
      sdk.readContract.mock.calls.map(([request]) => request.functionName)
    ).toEqual([
      "balanceOf",
      "balanceOf",
      "allowance",
      "grossAssets",
      "totalAssets",
      "totalSupply",
      "assetsPerShare",
      "pendingObligations",
      "unrecognizedMargin",
      "reservedLiabilities",
      "safetyBuffer",
      "freeLiquidity",
      "maxWithdraw",
    ]);
    expect(sdk.readContract).toHaveBeenNthCalledWith(
      13,
      expect.objectContaining({
        address: config.vaultAddress,
        args: ["0x0000000000000000000000000000000000000003"],
      })
    );
  });

  it("degrades the liquidity views a not-yet-redeployed vault lacks instead of failing the load", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_DESK_DOLLARS_ADDRESS",
      "0x0000000000000000000000000000000000000001"
    );
    vi.stubEnv(
      "NEXT_PUBLIC_BANKROLL_VAULT_ADDRESS",
      "0x0000000000000000000000000000000000000002"
    );
    const legacyViews = [
      "reservedLiabilities",
      "safetyBuffer",
      "freeLiquidity",
    ];
    sdk.readContract.mockImplementation(({ functionName }) =>
      legacyViews.includes(functionName)
        ? Promise.reject(new Error("function does not exist on this vault"))
        : Promise.resolve(1n)
    );
    const { getBankrollVaultConfig, readBankrollVaultState } =
      await import("./bankroll-vault");
    await expect(
      readBankrollVaultState(
        getBankrollVaultConfig()!,
        "0x0000000000000000000000000000000000000003"
      )
    ).resolves.toMatchObject({
      tUsdBalance: 1n,
      reservedLiabilities: undefined,
      safetyBuffer: undefined,
      freeLiquidity: undefined,
      maxWithdraw: 1n,
    });
  });
});
