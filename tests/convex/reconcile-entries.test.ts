import { describe, expect, it } from "vitest";
import { internal } from "../../convex/_generated/api";
import { makeT, seedActiveTrader, seedDeskManager } from "./setup";

/**
 * Reconcile mutation coverage (#207). Actions that hit the chain are out of
 * scope here; we assert clearOrphanEntry guards and listStaleOrphanEntries
 * selection that the cron relies on.
 */
describe("reconcile orphan entry mutations", () => {
  it("clearOrphanEntry deletes pending rows and logs activity", async () => {
    const t = makeT();
    const deskId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, deskId, { tokenId: 7 });

    const { entryId, dealId } = await t.run(async (ctx) => {
      const now = Date.now();
      const dealId = await ctx.db.insert("deals", {
        creatorDeskManagerId: deskId,
        creatorType: "desk_manager",
        prompt: "orphan deal",
        potUsdc: 1000,
        entryCostUsdc: 100,
        feeUsdc: 50,
        status: "open",
        createdAt: now,
        updatedAt: now,
      });
      const entryId = await ctx.db.insert("dealEntries", {
        dealId,
        traderId,
        paymentId: `pending:${traderId}:${dealId}`,
        entryCostUsdc: 100,
        createdAt: now - 20 * 60_000,
      });
      return { entryId, dealId };
    });

    const res = await t.mutation(internal.deals.clearOrphanEntry, {
      entryId,
      note: "test clear",
      resolveTxHash: "0xabc",
    });
    expect(res.cleared).toBe(true);

    await t.run(async (ctx) => {
      expect(await ctx.db.get(entryId)).toBeNull();
      const logs = await ctx.db
        .query("agentActivityLog")
        .withIndex("byTrader", (q) => q.eq("traderId", traderId))
        .collect();
      expect(
        logs.some(
          (l) =>
            l.activityType === "reconcile" &&
            l.dedupeKey === `reconcile:${entryId}`
        )
      ).toBe(true);
      const deal = await ctx.db.get(dealId);
      expect(deal?.status).toBe("open");
    });
  });

  it("clearOrphanEntry leaves verified entries alone", async () => {
    const t = makeT();
    const deskId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, deskId, { tokenId: 8 });

    const entryId = await t.run(async (ctx) => {
      const now = Date.now();
      const dealId = await ctx.db.insert("deals", {
        creatorDeskManagerId: deskId,
        creatorType: "desk_manager",
        prompt: "verified",
        potUsdc: 1000,
        entryCostUsdc: 100,
        feeUsdc: 50,
        status: "open",
        createdAt: now,
        updatedAt: now,
      });
      return ctx.db.insert("dealEntries", {
        dealId,
        traderId,
        paymentId: `onchain:0xdead`,
        enterTxHash: "0xdead",
        entryCostUsdc: 100,
        createdAt: now - 20 * 60_000,
      });
    });

    const res = await t.mutation(internal.deals.clearOrphanEntry, {
      entryId,
      note: "should no-op",
    });
    expect(res.cleared).toBe(false);
    await t.run(async (ctx) => {
      expect(await ctx.db.get(entryId)).not.toBeNull();
    });
  });

  it("listStaleOrphanEntries returns only stale pending rows", async () => {
    const t = makeT();
    const deskId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, deskId, { tokenId: 9 });
    const now = Date.now();

    const { staleId, freshId } = await t.run(async (ctx) => {
      const dealId = await ctx.db.insert("deals", {
        creatorDeskManagerId: deskId,
        creatorType: "desk_manager",
        prompt: "stale list",
        potUsdc: 1000,
        entryCostUsdc: 100,
        feeUsdc: 50,
        status: "open",
        onChainDealId: 42,
        createdAt: now,
        updatedAt: now,
      });
      const staleId = await ctx.db.insert("dealEntries", {
        dealId,
        traderId,
        paymentId: `pending:${traderId}:${dealId}:stale`,
        entryCostUsdc: 100,
        createdAt: now - 30 * 60_000,
      });
      const freshId = await ctx.db.insert("dealEntries", {
        dealId,
        traderId,
        paymentId: `pending:${traderId}:${dealId}:fresh`,
        entryCostUsdc: 100,
        createdAt: now - 60_000,
      });
      return { staleId, freshId };
    });

    const orphans = await t.query(internal.deals.listStaleOrphanEntries, {
      cutoffMs: now - 10 * 60_000,
    });
    const ids = orphans.map((o) => o.entryId);
    expect(ids).toContain(staleId);
    expect(ids).not.toContain(freshId);
    const stale = orphans.find((o) => o.entryId === staleId);
    expect(stale?.onChainDealId).toBe(42);
    expect(stale?.tokenId).toBe(9);
    expect(stale?.entryCostUsdc).toBe(100);
  });
});
