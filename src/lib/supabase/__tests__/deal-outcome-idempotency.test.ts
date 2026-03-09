import { describe, it, expect } from "vitest";

/**
 * Idempotency response shape when deal/enter finds an existing outcome.
 * Mirrors the logic in src/app/api/deal/enter/route.ts.
 */
function buildIdempotencySummary(existing: {
  trader_pnl_usdc?: number | string | null;
  rake_usdc?: number | string | null;
  trader_wiped_out?: boolean | null;
}) {
  const netPnl = Number(existing.trader_pnl_usdc ?? 0);
  const rake = Number(existing.rake_usdc ?? 0);
  const balanceChange = netPnl >= 0 ? netPnl + rake : netPnl;
  return {
    balance_change: balanceChange,
    rake,
    net_pnl: netPnl,
    wiped_out: Boolean(existing.trader_wiped_out),
    enter_tx_hash: null,
    resolve_tx_hash: null,
  };
}

describe("deal outcome idempotency", () => {
  it("builds summary from existing outcome (win)", () => {
    const existing = {
      trader_pnl_usdc: 90,
      rake_usdc: 10,
      trader_wiped_out: false,
    };
    const summary = buildIdempotencySummary(existing);
    expect(summary.net_pnl).toBe(90);
    expect(summary.rake).toBe(10);
    expect(summary.balance_change).toBe(100);
    expect(summary.wiped_out).toBe(false);
  });

  it("builds summary from existing outcome (loss)", () => {
    const existing = {
      trader_pnl_usdc: -50,
      rake_usdc: 0,
      trader_wiped_out: false,
    };
    const summary = buildIdempotencySummary(existing);
    expect(summary.net_pnl).toBe(-50);
    expect(summary.rake).toBe(0);
    expect(summary.balance_change).toBe(-50);
  });

  it("handles null/undefined fields", () => {
    const summary = buildIdempotencySummary({});
    expect(summary.net_pnl).toBe(0);
    expect(summary.rake).toBe(0);
    expect(summary.balance_change).toBe(0);
    expect(summary.wiped_out).toBe(false);
  });

  it("handles string numeric fields from DB", () => {
    const existing = {
      trader_pnl_usdc: "90.5",
      rake_usdc: "9.5",
      trader_wiped_out: false,
    };
    const summary = buildIdempotencySummary(existing);
    expect(summary.net_pnl).toBe(90.5);
    expect(summary.rake).toBe(9.5);
  });
});
