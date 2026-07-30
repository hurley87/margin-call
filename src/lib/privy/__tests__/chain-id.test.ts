import { describe, it, expect } from "vitest";
import {
  BASE_CHAIN_ID,
  BASE_CHAIN_ID_CAIP2,
  isChainIdBase,
  privyConfig,
  PAYMENT_CHAIN_ID,
} from "@/lib/privy/config";

/**
 * Payment chain is Robinhood Chain testnet (46630).
 */
describe("payment chain id helpers", () => {
  describe("constants", () => {
    it("BASE_CHAIN_ID matches the configured payment chain", () => {
      expect(typeof BASE_CHAIN_ID).toBe("number");
      expect(BASE_CHAIN_ID).toBe(PAYMENT_CHAIN_ID);
      expect(BASE_CHAIN_ID).toBe(46630);
    });

    it("BASE_CHAIN_ID_CAIP2 matches the configured payment chain", () => {
      expect(BASE_CHAIN_ID_CAIP2).toBe(`eip155:${BASE_CHAIN_ID}`);
    });
  });

  describe("Privy onboarding config", () => {
    it("offers email + external wallet login with embedded EVM wallet creation", () => {
      expect(privyConfig.loginMethods).toEqual(["email", "wallet"]);
      expect(privyConfig.appearance?.walletList).toEqual([
        "detected_wallets",
        "metamask",
        "coinbase_wallet",
        "wallet_connect",
      ]);
      expect(privyConfig.embeddedWallets?.ethereum?.createOnLogin).toBe(
        "users-without-wallets"
      );
    });

    it("supports only Robinhood Chain testnet (no mainnet)", () => {
      expect(privyConfig.supportedChains).toHaveLength(1);
      expect(privyConfig.supportedChains?.[0]?.id).toBe(46630);
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

    it("returns false for Base mainnet chain id", () => {
      expect(isChainIdBase(8453)).toBe(false);
      expect(isChainIdBase("8453")).toBe(false);
      expect(isChainIdBase("eip155:8453")).toBe(false);
    });

    it("returns false for Base Sepolia", () => {
      expect(isChainIdBase(84532)).toBe(false);
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
