import { describe, expect, it } from "vitest";
import { usdcApproveAllowance } from "../../convex/mcp/limits";

const USDC_DECIMALS = 1_000_000;

describe("usdcApproveAllowance", () => {
  it("adds headroom and caps at 500 USDC", () => {
    const required = BigInt(50) * BigInt(USDC_DECIMALS);
    const allowance = usdcApproveAllowance(required);
    expect(allowance).toBe(BigInt(60) * BigInt(USDC_DECIMALS));
  });

  it("caps large required amounts at 500 USDC", () => {
    const required = BigInt(490) * BigInt(USDC_DECIMALS);
    const allowance = usdcApproveAllowance(required);
    expect(allowance).toBe(BigInt(500) * BigInt(USDC_DECIMALS));
  });
});
