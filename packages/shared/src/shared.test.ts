import { describe, expect, it } from "vitest";

import {
  MOCK_USD_DECIMALS,
  MOCK_USD_UNIT,
  MULTICALL3_ADDRESS,
  PAYMENT_CHAIN,
  PAYMENT_CHAIN_ID,
  PACKCUSTODY_DEPLOY_BLOCK,
  RIPENGINE_DEPLOY_BLOCK,
  parseAddress,
  normalizeWalletAddress,
  STARTER_GRANT_CONFIG,
  STARTER_GRANT_CONFIG_V1,
} from "@margin-call/shared";

describe("@margin-call/shared single source of truth", () => {
  it("derives MOCK_USD_UNIT from decimals (no hardcoded drift)", () => {
    expect(MOCK_USD_UNIT).toBe(10 ** MOCK_USD_DECIMALS);
    expect(MOCK_USD_UNIT).toBe(1_000_000);
  });

  it("aliases STARTER_GRANT_CONFIG to V1", () => {
    expect(STARTER_GRANT_CONFIG).toBe(STARTER_GRANT_CONFIG_V1);
  });

  it("exports Robinhood testnet chain id and deploy blocks", () => {
    expect(PAYMENT_CHAIN_ID).toBe(46630);
    expect(PACKCUSTODY_DEPLOY_BLOCK).toBe(95_307_505);
    expect(RIPENGINE_DEPLOY_BLOCK).toBe(95_311_248);
  });

  it("wires Multicall3 on the payment chain for batched reads", () => {
    expect(MULTICALL3_ADDRESS).toBe(
      "0xcA11bde05977b3631167028862bE2a173976CA11"
    );
    expect(PAYMENT_CHAIN.contracts?.multicall3?.address).toBe(
      MULTICALL3_ADDRESS
    );
  });

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
});
