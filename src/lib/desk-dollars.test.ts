import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Desk Dollars public configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("accepts only valid statically named public token and faucet addresses", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_DESK_DOLLARS_ADDRESS",
      "0x0000000000000000000000000000000000000001"
    );
    vi.stubEnv(
      "NEXT_PUBLIC_DESK_DOLLARS_FAUCET_ADDRESS",
      "0x0000000000000000000000000000000000000002"
    );
    const { getDeskDollarsConfig } = await import("./desk-dollars");
    expect(getDeskDollarsConfig()).toEqual({
      tokenAddress: "0x0000000000000000000000000000000000000001",
      faucetAddress: "0x0000000000000000000000000000000000000002",
    });
  });

  it("degrades when either public address is absent or invalid", async () => {
    vi.stubEnv("NEXT_PUBLIC_DESK_DOLLARS_ADDRESS", "not-an-address");
    vi.stubEnv("NEXT_PUBLIC_DESK_DOLLARS_FAUCET_ADDRESS", "");
    const { getDeskDollarsConfig } = await import("./desk-dollars");
    expect(getDeskDollarsConfig()).toBeNull();
  });
});
