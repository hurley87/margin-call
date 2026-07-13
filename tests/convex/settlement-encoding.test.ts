import { describe, expect, it } from "vitest";
import {
  clampSettleEntryArgs,
  rawToUsdc,
  usdcToRaw,
} from "../../convex/lib/settlementEncoding";

/** Helpers matching Foundry _grossPayout / 6-decimal USDC. */
const e6 = (n: number) => BigInt(Math.round(n * 1e6));

describe("clampSettleEntryArgs (#206/#207 settlement encoding)", () => {
  const baseCaps = {
    entryCostRaw: e6(100),
    potAmountRaw: e6(1550), // net pot after entries
    reservedAmountRaw: e6(600), // 6 pending × 100
    maxExtractionAmountRaw: e6(237.5),
  };

  it("passes through break-even (gross = entry, rake 0)", () => {
    const out = clampSettleEntryArgs({
      ...baseCaps,
      entryCostUsdc: 100,
      traderPnlUsdc: 0,
      rakeUsdc: 0,
    });
    expect(out.grossPayoutRaw).toBe(e6(100));
    expect(out.rakeRaw).toBe(0n);
    expect(out.profitRaw).toBe(0n);
    expect(out.traderPnlUsdc).toBe(0);
    expect(out.rakeUsdc).toBe(0);
    expect(out.potChangeUsdc).toBe(0);
  });

  it("clamps win to extraction cap and returns matching USDC economics", () => {
    // Desired: entry + 500 profit + 10 rake → far above 237.5 cap.
    const out = clampSettleEntryArgs({
      ...baseCaps,
      reservedAmountRaw: e6(100), // single pending
      potAmountRaw: e6(1050),
      entryCostUsdc: 100,
      traderPnlUsdc: 500,
      rakeUsdc: 10,
    });
    expect(out.grossPayoutRaw).toBe(e6(100) + e6(237.5));
    expect(out.profitRaw).toBe(e6(237.5));
    expect(out.rakeRaw).toBe(e6(10)); // still ≤ profit
    // Recorded PnL = clamped profit − rake (what the trader is actually paid).
    expect(out.traderPnlUsdc).toBe(237.5 - 10);
    expect(out.rakeUsdc).toBe(10);
    expect(out.potChangeUsdc).toBe(-237.5);
  });

  it("clamps rake to clamped profit", () => {
    const out = clampSettleEntryArgs({
      ...baseCaps,
      reservedAmountRaw: e6(100),
      potAmountRaw: e6(1050),
      entryCostUsdc: 100,
      traderPnlUsdc: 50,
      rakeUsdc: 80, // asked rake > profit
    });
    // gross before clamp = 100+50+80 = 230 → under caps
    expect(out.grossPayoutRaw).toBe(e6(230));
    expect(out.profitRaw).toBe(e6(130));
    expect(out.rakeRaw).toBe(e6(80));
    expect(out.traderPnlUsdc).toBe(50);
    expect(out.rakeUsdc).toBe(80);
    expect(out.potChangeUsdc).toBe(-130);
  });

  it("forces rake to 0 on full loss", () => {
    const out = clampSettleEntryArgs({
      ...baseCaps,
      reservedAmountRaw: e6(100),
      potAmountRaw: e6(1050),
      entryCostUsdc: 100,
      traderPnlUsdc: -100,
      rakeUsdc: 25,
    });
    // gross desired = max(0, 100-100+25)=25 → profit 0 after clamp?
    // Actually Math.max(0, 25)=25, profit = 0 since 25 < entry, rake clamped to 0.
    expect(out.grossPayoutRaw).toBe(e6(25));
    expect(out.profitRaw).toBe(0n);
    expect(out.rakeRaw).toBe(0n);
    expect(out.traderPnlUsdc).toBe(-75);
    expect(out.rakeUsdc).toBe(0);
    expect(out.potChangeUsdc).toBe(75);
  });

  it("clamps to available pot leaving peer reserves", () => {
    // pot=200, reserved=200, entry=100 → available=100
    const out = clampSettleEntryArgs({
      entryCostRaw: e6(100),
      potAmountRaw: e6(200),
      reservedAmountRaw: e6(200),
      maxExtractionAmountRaw: e6(237.5),
      entryCostUsdc: 100,
      traderPnlUsdc: 150,
      rakeUsdc: 0,
    });
    expect(out.grossPayoutRaw).toBe(e6(100));
    expect(out.profitRaw).toBe(0n);
    expect(out.traderPnlUsdc).toBe(0);
    expect(out.rakeUsdc).toBe(0);
    expect(out.potChangeUsdc).toBe(0);
  });

  it("passes through a normal loss unchanged", () => {
    const out = clampSettleEntryArgs({
      ...baseCaps,
      reservedAmountRaw: e6(100),
      potAmountRaw: e6(1050),
      entryCostUsdc: 100,
      traderPnlUsdc: -70,
      rakeUsdc: 0,
    });
    expect(out.grossPayoutRaw).toBe(e6(30));
    expect(out.traderPnlUsdc).toBe(-70);
    expect(out.rakeUsdc).toBe(0);
    expect(out.potChangeUsdc).toBe(70);
  });

  it("usdcToRaw rounds and floors negatives", () => {
    expect(usdcToRaw(1.2345678)).toBe(1234568n);
    expect(usdcToRaw(-5)).toBe(0n);
    expect(rawToUsdc(e6(237.5))).toBe(237.5);
  });
});
