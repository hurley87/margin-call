import { describe, it, expect } from "vitest";
import {
  frozenMaxExtractionAmountUsdc,
  maxWinValueUsdc,
} from "./extraction-cap";

describe("extraction-cap", () => {
  it("derives frozen cap from creation net pot", () => {
    expect(frozenMaxExtractionAmountUsdc(950)).toBe(237.5);
    expect(frozenMaxExtractionAmountUsdc(1000)).toBe(250);
  });

  it("uses frozen cap when set even if live pot grew", () => {
    const cap = maxWinValueUsdc({
      pot_usdc: 1500,
      max_extraction_amount_usdc: 237.5,
    });
    expect(cap).toBe(237.5);
  });

  it("throws when frozen cap is unset", () => {
    expect(() => maxWinValueUsdc({ pot_usdc: 1500 })).toThrow(
      /missing frozen maxExtractionAmountUsdc/
    );
    expect(() =>
      maxWinValueUsdc({ pot_usdc: 1500, max_extraction_amount_usdc: null })
    ).toThrow(/missing frozen maxExtractionAmountUsdc/);
  });
});
