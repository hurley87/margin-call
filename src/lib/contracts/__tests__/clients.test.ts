import { afterEach, describe, expect, it } from "vitest";

import { getRobinhoodRpcUrl, parsePrivateKey } from "@/lib/contracts/clients";
import { stockSymbolForAddress } from "@/lib/contracts/stock-tokens";
import { getContractAddresses } from "@/lib/contracts/addresses";

describe("getRobinhoodRpcUrl", () => {
  afterEach(() => {
    delete process.env.ROBINHOOD_TESTNET_RPC_URL;
    delete process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL;
  });

  it("falls back to the public Robinhood RPC", () => {
    expect(getRobinhoodRpcUrl()).toBe(
      "https://rpc.testnet.chain.robinhood.com"
    );
  });

  it("prefers ROBINHOOD_TESTNET_RPC_URL", () => {
    process.env.ROBINHOOD_TESTNET_RPC_URL = "https://custom.rpc/example";
    process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL =
      "https://public.rpc/example";
    expect(getRobinhoodRpcUrl()).toBe("https://custom.rpc/example");
  });
});

describe("parsePrivateKey", () => {
  it("accepts 0x-prefixed 32-byte keys", () => {
    const key =
      "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    expect(parsePrivateKey(key)).toBe(key);
  });

  it("adds 0x when missing", () => {
    const raw =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    expect(parsePrivateKey(raw)).toBe(`0x${raw}`);
  });

  it("rejects invalid keys", () => {
    expect(() => parsePrivateKey("0xdead")).toThrow(/32-byte/);
    expect(() => parsePrivateKey("")).toThrow(/empty/);
  });
});

describe("stockSymbolForAddress", () => {
  it("resolves known Stock Tokens case-insensitively", () => {
    expect(
      stockSymbolForAddress("0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02")
    ).toBe("AMZN");
    expect(
      stockSymbolForAddress("0x5884ad2f920c162cfbbacc88c9c51aa75ec09e02")
    ).toBe("AMZN");
  });

  it("returns null for unknown addresses", () => {
    expect(
      stockSymbolForAddress("0x0000000000000000000000000000000000000001")
    ).toBeNull();
  });
});

describe("getContractAddresses", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_MARGIN_CALL_NETWORK;
    delete process.env.MARGIN_CALL_NETWORK;
    delete process.env.NEXT_PUBLIC_MOCKUSD_ADDRESS;
    delete process.env.NEXT_PUBLIC_PACKCUSTODY_ADDRESS;
    delete process.env.NEXT_PUBLIC_ASSETREGISTRY_ADDRESS;
    delete process.env.NEXT_PUBLIC_RIPENGINE_ADDRESS;
    delete process.env.NEXT_PUBLIC_GAMETOKEN_ADDRESS;
    delete process.env.NEXT_PUBLIC_DISTRIBUTOR_ADDRESS;
  });

  it("returns null when network is not Robinhood testnet", () => {
    process.env.NEXT_PUBLIC_MARGIN_CALL_NETWORK = "base-sepolia";
    expect(getContractAddresses()).toBeNull();
  });

  it("throws when Robinhood testnet is selected but addresses are missing", () => {
    process.env.NEXT_PUBLIC_MARGIN_CALL_NETWORK = "robinhood-testnet";
    expect(() => getContractAddresses()).toThrow(/NEXT_PUBLIC_MOCKUSD_ADDRESS/);
  });
});
