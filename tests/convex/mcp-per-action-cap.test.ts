import { describe, it, expect } from "vitest";
import {
  resolvePerActionCapUsdc,
  DEFAULT_PER_ACTION_CAP_USDC,
} from "../../convex/mcp/limits";

describe("MCP per-action cap resolution", () => {
  it("falls back to DEFAULT_PER_ACTION_CAP_USDC when desk is null or no caps set", () => {
    expect(resolvePerActionCapUsdc(null, "withdraw_to_address")).toBe(
      DEFAULT_PER_ACTION_CAP_USDC
    );
    expect(resolvePerActionCapUsdc({}, "create_deal")).toBe(
      DEFAULT_PER_ACTION_CAP_USDC
    );
  });

  it("uses perActionCapUsdc when set without per-tool override", () => {
    expect(
      resolvePerActionCapUsdc({ perActionCapUsdc: 250 }, "fund_trader")
    ).toBe(250);
  });

  it("prefers a per-tool override over perActionCapUsdc", () => {
    expect(
      resolvePerActionCapUsdc(
        {
          perActionCapUsdc: 250,
          perToolCapUsdc: { withdraw_to_address: 100, create_deal: 750 },
        },
        "withdraw_to_address"
      )
    ).toBe(100);
    expect(
      resolvePerActionCapUsdc(
        {
          perActionCapUsdc: 250,
          perToolCapUsdc: { withdraw_to_address: 100, create_deal: 750 },
        },
        "create_deal"
      )
    ).toBe(750);
  });

  it("ignores non-numeric or non-positive overrides", () => {
    expect(
      resolvePerActionCapUsdc(
        {
          perActionCapUsdc: 400,
          perToolCapUsdc: { withdraw_to_address: "lots" },
        },
        "withdraw_to_address"
      )
    ).toBe(400);
    expect(
      resolvePerActionCapUsdc(
        { perActionCapUsdc: 400, perToolCapUsdc: { fund_trader: 0 } },
        "fund_trader"
      )
    ).toBe(400);
  });

  it("falls through to default when the override map is not an object", () => {
    expect(
      resolvePerActionCapUsdc(
        // simulate a corrupted settings value
        { perActionCapUsdc: undefined, perToolCapUsdc: "oops" as unknown },
        "create_deal"
      )
    ).toBe(DEFAULT_PER_ACTION_CAP_USDC);
  });
});
