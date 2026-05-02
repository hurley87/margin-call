import { describe, it, expect } from "vitest";
import {
  BASE_CHAIN_ID,
  BASE_CHAIN_ID_CAIP2,
  isChainIdBase,
} from "@/lib/privy/config";

/**
 * Payment chain is Base Sepolia (84532) in development.
 * These tests validate the chain-id helpers against the actual configured chain,
 * not a hardcoded mainnet assumption.
 */
describe("payment chain id helpers", () => {
  describe("constants", () => {
    it("BASE_CHAIN_ID matches the configured payment chain", () => {
      // Config uses baseSepolia (84532) — assert the actual value
      expect(typeof BASE_CHAIN_ID).toBe("number");
      expect(BASE_CHAIN_ID).toBe(84532);
    });

    it("BASE_CHAIN_ID_CAIP2 matches the configured payment chain", () => {
      expect(BASE_CHAIN_ID_CAIP2).toBe(`eip155:${BASE_CHAIN_ID}`);
    });
  });

  describe("isChainIdBase", () => {
    it("returns true for the payment chain id number", () => {
      expect(isChainIdBase(BASE_CHAIN_ID)).toBe(true);
    });

    it("returns true for the payment chain CAIP-2 string", () => {
      expect(isChainIdBase(BASE_CHAIN_ID_CAIP2)).toBe(true);
    });

    it("returns true for string version of chain id", () => {
      expect(isChainIdBase(String(BASE_CHAIN_ID))).toBe(true);
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
