import { describe, it, expect } from "vitest";
import {
  formatPaymentPrice,
  calculateCreationFee,
  calculateNetPot,
  resolveDealPaymentPrice,
} from "../payment-validation";

describe("formatPaymentPrice", () => {
  it("formats whole numbers", () => {
    expect(formatPaymentPrice(50)).toBe("$50.00");
  });

  it("formats decimals", () => {
    expect(formatPaymentPrice(25.5)).toBe("$25.50");
  });

  it("formats small amounts", () => {
    expect(formatPaymentPrice(1)).toBe("$1.00");
  });
});

describe("calculateCreationFee", () => {
  it("calculates 5% fee on 100 USDC", () => {
    expect(calculateCreationFee(100)).toBe(5);
  });

  it("calculates 5% fee on 5 USDC (minimum)", () => {
    expect(calculateCreationFee(5)).toBe(0.25);
  });

  it("calculates 5% fee on fractional amounts", () => {
    expect(calculateCreationFee(33.33)).toBeCloseTo(1.6665);
  });
});

describe("calculateNetPot", () => {
  it("returns pot minus 5% fee", () => {
    expect(calculateNetPot(100)).toBe(95);
  });

  it("returns pot minus fee for minimum amount", () => {
    expect(calculateNetPot(5)).toBe(4.75);
  });
});

describe("resolveDealPaymentPrice", () => {
  it("returns price string for valid pot_amount", () => {
    expect(resolveDealPaymentPrice({ pot_amount: 50 })).toBe("$50.00");
  });

  it("returns price for minimum pot amount", () => {
    expect(resolveDealPaymentPrice({ pot_amount: 5 })).toBe("$5.00");
  });

  it("returns null for missing pot_amount", () => {
    expect(resolveDealPaymentPrice({})).toBeNull();
  });

  it("returns null for pot_amount below minimum", () => {
    expect(resolveDealPaymentPrice({ pot_amount: 2 })).toBeNull();
  });

  it("returns null for non-numeric pot_amount", () => {
    expect(resolveDealPaymentPrice({ pot_amount: "abc" })).toBeNull();
  });

  it("returns null for zero pot_amount", () => {
    expect(resolveDealPaymentPrice({ pot_amount: 0 })).toBeNull();
  });

  it("returns null for negative pot_amount", () => {
    expect(resolveDealPaymentPrice({ pot_amount: -10 })).toBeNull();
  });

  it("handles string numbers by coercing", () => {
    expect(resolveDealPaymentPrice({ pot_amount: "100" })).toBe("$100.00");
  });
});
