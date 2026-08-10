import { describe, expect, it } from "vitest";
import { parseTUsdInput } from "./tusd-input";

describe("parseTUsdInput", () => {
  it("parses Desk Dollars exactly to six decimal places", () => {
    expect(parseTUsdInput("12.345678")).toBe(12345678n);
    expect(parseTUsdInput("12.3")).toBe(12300000n);
    expect(parseTUsdInput("0.000001")).toBe(1n);
  });

  it("rejects values that cannot be represented as six-decimal tUSD", () => {
    expect(parseTUsdInput("12.3456789")).toBeNull();
    expect(parseTUsdInput("1e2")).toBeNull();
    expect(parseTUsdInput("-1")).toBeNull();
    expect(parseTUsdInput("")).toBeNull();
  });
});
