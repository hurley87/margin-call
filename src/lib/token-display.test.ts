import { describe, expect, it } from "vitest";
import { maxUint256 } from "viem";

import {
  formatAllowanceDisplay,
  formatTokenAmountDisplay,
} from "./token-display";

describe("token display formatting", () => {
  it("labels a max uint256 ERC-20 allowance as unlimited", () => {
    expect(formatAllowanceDisplay(maxUint256, 18)).toEqual({
      compact: "Unlimited",
      exact: "Unlimited (max uint256)",
    });
  });

  it("compacts long values without presenting a rounded value as exact", () => {
    expect(formatTokenAmountDisplay(123_456_789_012_345_678_901n, 18)).toEqual({
      compact: "123.456789…",
      exact: "123.456789012345678901",
    });
    expect(formatTokenAmountDisplay(1n, 18)).toEqual({
      compact: "1.00000e-18",
      exact: "0.000000000000000001",
    });
    expect(formatTokenAmountDisplay(10n ** 48n, 18)).toEqual({
      compact: "1.00000e+30",
      exact: "1000000000000000000000000000000",
    });
    expect(formatTokenAmountDisplay(10n ** 48n + 1n, 18)).toEqual({
      compact: "1.00000…e+30",
      exact: "1000000000000000000000000000000.000000000000000001",
    });
  });
});
