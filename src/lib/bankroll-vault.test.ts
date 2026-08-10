import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Bankroll Vault public configuration and reads", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
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
});
