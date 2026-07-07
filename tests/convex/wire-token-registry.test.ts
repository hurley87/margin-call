import { describe, it, expect } from "vitest";
import {
  TOKEN_REGISTRY,
  tokenBySymbol,
  tokenByAddress,
  houseToken,
} from "../../convex/wire/tokenRegistry";

describe("tokenRegistry", () => {
  it("loads and validates all twelve seed companies", () => {
    expect(TOKEN_REGISTRY.length).toBe(12);
    for (const t of TOKEN_REGISTRY) {
      expect(t.symbol).toMatch(/^[A-Z0-9]+$/);
      expect(t.xHandle.startsWith("@")).toBe(true);
      expect(t.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(t.addressLc).toBe(t.address.toLowerCase());
      expect(t.slug).toBe(t.symbol.toLowerCase());
    }
  });

  it("has exactly one house token (HARNESS)", () => {
    const house = houseToken();
    expect(house?.symbol).toBe("HARNESS");
    expect(TOKEN_REGISTRY.filter((t) => t.isHouseToken).length).toBe(1);
  });

  it("has unique symbols and addresses", () => {
    const symbols = TOKEN_REGISTRY.map((t) => t.symbol);
    const addrs = TOKEN_REGISTRY.map((t) => t.addressLc);
    expect(new Set(symbols).size).toBe(symbols.length);
    expect(new Set(addrs).size).toBe(addrs.length);
  });

  it("looks up by symbol and address (case-insensitive)", () => {
    const kupo = tokenBySymbol("kupo");
    expect(kupo?.symbol).toBe("KUPO");
    expect(tokenByAddress(kupo!.address.toUpperCase())?.symbol).toBe("KUPO");
  });
});
