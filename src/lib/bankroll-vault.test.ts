import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  readContract: vi.fn(),
  getBlock: vi.fn(),
}));

vi.mock("./base-sepolia", () => ({
  baseSepoliaPublicClient: {
    readContract: (...args: unknown[]) => sdk.readContract(...args),
    getBlock: (...args: unknown[]) => sdk.getBlock(...args),
  },
}));

vi.mock("./margin-call-crash", async () => {
  const actual = await vi.importActual<typeof import("./margin-call-crash")>(
    "./margin-call-crash"
  );
  return {
    ...actual,
    getMarginCallCrashConfig: () => null,
  };
});

describe("Bankroll Vault public configuration and reads", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    sdk.readContract.mockReset();
    sdk.getBlock.mockReset();
    sdk.getBlock.mockResolvedValue({ number: 10n, timestamp: 1_000_000n });
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

  it("reads freeze, realized PnL, and risk views from the configured vault", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_DESK_DOLLARS_ADDRESS",
      "0x0000000000000000000000000000000000000001"
    );
    vi.stubEnv(
      "NEXT_PUBLIC_BANKROLL_VAULT_ADDRESS",
      "0x0000000000000000000000000000000000000002"
    );
    const noBlocking =
      0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn;
    sdk.readContract.mockImplementation(({ functionName }) => {
      switch (functionName) {
        case "balanceOf":
          return Promise.resolve(1n);
        case "allowance":
          return Promise.resolve(2n);
        case "grossAssets":
          return Promise.resolve(25_000_000_000n);
        case "totalAssets":
          return Promise.resolve(24_000_000_000n);
        case "totalSupply":
          return Promise.resolve(24_000_000_000n);
        case "assetsPerShare":
          return Promise.resolve(1_000_000n);
        case "pendingObligations":
          return Promise.resolve(0n);
        case "unrecognizedMargin":
          return Promise.resolve(0n);
        case "reservedLiabilities":
          return Promise.resolve(1_250_000_000n);
        case "safetyBuffer":
          return Promise.resolve(5_000_000_000n);
        case "freeLiquidity":
          return Promise.resolve(18_750_000_000n);
        case "realizedGamePnl":
          return Promise.resolve(-250_000n);
        case "frozenRoundCount":
          return Promise.resolve(0n);
        case "oldestBlockingRound":
          return Promise.resolve(noBlocking);
        case "shareOperationsFrozen":
          return Promise.resolve(false);
        case "NO_BLOCKING_ROUND":
          return Promise.resolve(noBlocking);
        case "maxWithdraw":
          return Promise.resolve(13n);
        default:
          return Promise.resolve(0n);
      }
    });
    const {
      getBankrollVaultConfig,
      readBankrollVaultState,
      computeUtilizationBps,
      computeRemainingPayoutCapacity,
      computeTierPlayerCapacity,
    } = await import("./bankroll-vault");
    const config = getBankrollVaultConfig()!;
    await expect(
      readBankrollVaultState(
        config,
        "0x0000000000000000000000000000000000000003"
      )
    ).resolves.toMatchObject({
      reservedLiabilities: 1_250_000_000n,
      realizedGamePnl: -250_000n,
      shareOperationsFrozen: false,
      maxWithdraw: 13n,
      utilizationBps: 500n,
      blockingRounds: [],
    });
    expect(computeUtilizationBps(1_250_000_000n, 25_000_000_000n)).toBe(500n);
    expect(
      computeRemainingPayoutCapacity({
        grossAssets: 25_000_000_000n,
        freeLiquidity: 18_750_000_000n,
        roundExposure: 0n,
      })
    ).toBe(100_000_000n);
    expect(computeTierPlayerCapacity(100_000_000n)[0]).toMatchObject({
      label: "1.25x",
      maxMargin: 80_000_000n,
    });
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
      "realizedGamePnl",
      "frozenRoundCount",
      "oldestBlockingRound",
      "shareOperationsFrozen",
      "NO_BLOCKING_ROUND",
      "roundExposure",
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
      realizedGamePnl: undefined,
      shareOperationsFrozen: false,
      maxWithdraw: 1n,
      blockingRounds: [],
    });
  });
});
