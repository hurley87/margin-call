import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { seedDeskManager, seedActiveTrader, seedDeal } from "./setup";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("portfolio.forDesk", () => {
  it("returns empty portfolio when no traders", async () => {
    const t = convexTest(schema, modules);
    const subject = "did:privy:pf-empty";
    await seedDeskManager(t, { subject });
    const authed = t.withIdentity({
      subject,
      tokenIdentifier: subject,
      issuer: "https://auth.privy.io",
    });
    const p = await authed.query(api.portfolio.forDesk, {});
    expect(p.totalValueUsdc).toBe(0);
    expect(p.traders).toEqual([]);
    expect(p.stats.totalPnl).toBe(0);
  });

  it("aggregates escrow, assets, outcomes, and cumulative pnl history", async () => {
    const t = convexTest(schema, modules);
    const subject = "did:privy:pf-full";
    const dmId = await seedDeskManager(t, { subject });
    const traderId = await seedActiveTrader(t, dmId, {
      ownerSubject: subject,
      escrowBalance: 100,
      name: "Zeta",
    });
    const dealId = await seedDeal(t);

    const tEarly = Date.now() - 2000;
    const tLate = Date.now() - 1000;

    await t.run(async (ctx) => {
      await ctx.db.insert("assets", {
        traderId: traderId as Id<"traders">,
        name: "Watch",
        valueUsdc: 50,
        acquiredAt: Date.now(),
      });
      await ctx.db.insert("dealOutcomes", {
        dealId: dealId as Id<"deals">,
        traderId: String(traderId),
        traderPnlUsdc: 10,
        traderWipedOut: false,
        createdAt: tEarly,
      });
      await ctx.db.insert("dealOutcomes", {
        dealId: dealId as Id<"deals">,
        traderId: String(traderId),
        traderPnlUsdc: -5,
        traderWipedOut: false,
        createdAt: tLate,
      });
    });

    const authed = t.withIdentity({
      subject,
      tokenIdentifier: subject,
      issuer: "https://auth.privy.io",
    });
    const p = await authed.query(api.portfolio.forDesk, {});
    expect(p.traders).toHaveLength(1);
    expect(p.traders[0].escrowUsdc).toBe(100);
    expect(p.traders[0].assetValueUsdc).toBe(50);
    expect(p.traders[0].totalValueUsdc).toBe(150);
    expect(p.totalValueUsdc).toBe(150);
    expect(p.pnlHistory).toHaveLength(2);
    expect(p.pnlHistory[0].cumulativePnl).toBe(10);
    expect(p.pnlHistory[1].cumulativePnl).toBe(5);
    expect(p.stats.totalWins).toBe(1);
    expect(p.stats.totalLosses).toBe(1);
    expect(p.stats.totalPnl).toBe(5);
    expect(p.stats.totalWipeouts).toBe(0);
  });
});
