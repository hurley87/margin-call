import { describe, expect, it } from "vitest";

import {
  normalizeWalletAddress,
  parseAddress,
  parsePrivateKey,
} from "@margin-call/shared";

describe("@margin-call/shared validation helpers", () => {
  it("parses and normalizes addresses", () => {
    expect(parseAddress("0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02")).toBe(
      "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02"
    );
    expect(
      normalizeWalletAddress("0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02")
    ).toBe("0x5884ad2f920c162cfbbacc88c9c51aa75ec09e02");
    expect(parseAddress(undefined)).toBeUndefined();
    expect(() => parseAddress("0xdead")).toThrow(/20-byte/);
  });

  it("validates private keys without exposing their value", () => {
    expect(parsePrivateKey("11".repeat(32))).toMatch(/^0x[0-9a-f]{64}$/);
    expect(() => parsePrivateKey("0xdead")).toThrow(/32-byte/);
  });
});
