import { describe, it, expect } from "vitest";
import {
  BASE_CHAIN_ID,
  BASE_CHAIN_ID_CAIP2,
  isChainIdBase,
} from "@/lib/privy/config";

describe("Base chain id helpers", () => {
  describe("constants", () => {
    it("BASE_CHAIN_ID is 8453", () => {
      expect(BASE_CHAIN_ID).toBe(8453);
    });

    it("BASE_CHAIN_ID_CAIP2 is eip155:8453", () => {
      expect(BASE_CHAIN_ID_CAIP2).toBe("eip155:8453");
    });
  });

  describe("isChainIdBase", () => {
    it("returns true for Base chain id number", () => {
      expect(isChainIdBase(8453)).toBe(true);
    });

    it("returns true for Base CAIP-2 string", () => {
      expect(isChainIdBase("eip155:8453")).toBe(true);
    });

    it('returns true for string "8453"', () => {
      expect(isChainIdBase("8453")).toBe(true);
    });

    it("returns false for other chain id numbers", () => {
      expect(isChainIdBase(1)).toBe(false);
      expect(isChainIdBase(137)).toBe(false);
      expect(isChainIdBase(42161)).toBe(false);
    });

    it("returns false for other CAIP-2 strings", () => {
      expect(isChainIdBase("eip155:1")).toBe(false);
      expect(isChainIdBase("eip155:137")).toBe(false);
    });

    it("returns false for invalid or empty strings", () => {
      expect(isChainIdBase("")).toBe(false);
      expect(isChainIdBase("eip155:")).toBe(false);
    });
  });
});
