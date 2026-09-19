import { describe, expect, it } from "vitest";
import { readDynamicServerWalletEnv } from "@/lib/wallets/config";

const REQUIRED = {
  DYNAMIC_API_TOKEN: "dyn_token_test",
  DYNAMIC_WALLET_PASSWORD: "backup-password",
  DYNAMIC_ENVIRONMENT_ID: "env_abc",
};

describe("readDynamicServerWalletEnv", () => {
  it("reads server-wallet credentials without requiring a private key", () => {
    const env = readDynamicServerWalletEnv(REQUIRED);
    expect(env).toEqual({
      environmentId: "env_abc",
      apiToken: "dyn_token_test",
      walletPassword: "backup-password",
      storePath: ".dynamic-agent-wallet.json",
      rpcUrl: "https://mainnet.base.org",
    });
    expect(Object.keys(REQUIRED)).not.toContain("PRIVATE_KEY");
  });

  it("falls back to the public Dynamic environment id", () => {
    const env = readDynamicServerWalletEnv({
      DYNAMIC_API_TOKEN: "dyn_token_test",
      DYNAMIC_WALLET_PASSWORD: "backup-password",
      NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID: "env_public",
    });
    expect(env.environmentId).toBe("env_public");
  });

  it("fails closed when the API token is missing", () => {
    expect(() =>
      readDynamicServerWalletEnv({
        DYNAMIC_WALLET_PASSWORD: "backup-password",
        DYNAMIC_ENVIRONMENT_ID: "env_abc",
      })
    ).toThrow(/DYNAMIC_API_TOKEN/);
  });
});
