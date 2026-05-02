/**
 * Behavior tests: Trader cycle + idempotency invariants
 *
 * Tests:
 * - Stale trader is eligible for cycle dispatch
 * - Cycle lease CAS prevents double-entry when called concurrently
 * - markCycleComplete updates lastCycleAt and releases lease
 * - releaseCycleLease respects generation guard
 * - Outcome apply is idempotent (same traderId+dealId → same id, no duplicate)
 * - applyOutcomeBalance is idempotent (same outcomeId → no-op on retry)
 * - Activity log append deduplication (same dedupeKey → single row)
 * - Wallet creation is at-most-once per trader (pending → creating → ready CAS)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { internal } from "../_generated/api";
import { makeT, seedDeskManager, seedActiveTrader, seedDeal } from "./_setup";

const modules = import.meta.glob("../**/*.ts");

describe("Cycle lease: stale trader eligibility", () => {
  it("returns stale trader (no lastCycleAt) as eligible", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    await seedActiveTrader(t, dmId, { lastCycleAt: undefined });

    const stale = await t.query(
      internal.agent.internal.listStaleTradersForCycle,
      {}
    );
    expect(stale.length).toBe(1);
  });

  it("returns stale trader (old lastCycleAt) as eligible", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const oldCycleAt = Date.now() - 5 * 60 * 1000; // 5 min ago (stale)
    await seedActiveTrader(t, dmId, { lastCycleAt: oldCycleAt });

    const stale = await t.query(
      internal.agent.internal.listStaleTradersForCycle,
      {}
    );
    expect(stale.length).toBe(1);
  });

  it("does NOT return trader with fresh lastCycleAt", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const freshCycleAt = Date.now() - 10_000; // 10s ago (fresh)
    await seedActiveTrader(t, dmId, { lastCycleAt: freshCycleAt });

    const stale = await t.query(
      internal.agent.internal.listStaleTradersForCycle,
      {}
    );
    expect(stale.length).toBe(0);
  });

  it("does NOT return trader with active cycle lease", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const activeLease = Date.now() + 60_000; // lease expires in 60s
    await seedActiveTrader(t, dmId, { cycleLeaseUntil: activeLease });

    const stale = await t.query(
      internal.agent.internal.listStaleTradersForCycle,
      {}
    );
    expect(stale.length).toBe(0);
  });

  it("does NOT return trader with walletStatus != ready", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    // Insert trader with pending wallet directly
    await t.run(async (ctx) => {
      const now = Date.now();
      return ctx.db.insert("traders", {
        deskManagerId: dmId as never,
        ownerSubject: "did:privy:test-subject-001",
        name: "Pending Wallet Trader",
        status: "active",
        walletStatus: "pending",
        escrowBalanceUsdc: 1000,
        cycleGeneration: 0,
        mandate: {},
        createdAt: now,
        updatedAt: now,
      });
    });

    const stale = await t.query(
      internal.agent.internal.listStaleTradersForCycle,
      {}
    );
    expect(stale.length).toBe(0);
  });
});

describe("Cycle lease: compare-and-set (CAS)", () => {
  it("acquires lease when generation matches and no active lease", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, { cycleGeneration: 0 });

    const result = await t.mutation(internal.agent.internal.acquireCycleLease, {
      traderId: traderId as never,
      expectedGeneration: 0,
      leaseUntil: Date.now() + 90_000,
    });

    expect(result.acquired).toBe(true);
    expect(result.generation).toBe(1);
  });

  it("rejects acquisition when generation does not match (concurrent race)", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, { cycleGeneration: 2 });

    const result = await t.mutation(internal.agent.internal.acquireCycleLease, {
      traderId: traderId as never,
      expectedGeneration: 0, // stale generation
      leaseUntil: Date.now() + 90_000,
    });

    expect(result.acquired).toBe(false);
  });

  it("rejects acquisition when lease is still active", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, {
      cycleGeneration: 1,
      cycleLeaseUntil: Date.now() + 60_000, // active lease
    });

    const result = await t.mutation(internal.agent.internal.acquireCycleLease, {
      traderId: traderId as never,
      expectedGeneration: 1,
      leaseUntil: Date.now() + 90_000,
    });

    expect(result.acquired).toBe(false);
  });

  it("second concurrent call with same expectedGeneration is rejected", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, { cycleGeneration: 0 });

    // First caller acquires
    const first = await t.mutation(internal.agent.internal.acquireCycleLease, {
      traderId: traderId as never,
      expectedGeneration: 0,
      leaseUntil: Date.now() + 90_000,
    });
    expect(first.acquired).toBe(true);

    // Second caller with same expectedGeneration (simulates race) is rejected
    const second = await t.mutation(internal.agent.internal.acquireCycleLease, {
      traderId: traderId as never,
      expectedGeneration: 0,
      leaseUntil: Date.now() + 90_000,
    });
    expect(second.acquired).toBe(false);
  });
});

describe("Cycle lease: markCycleComplete and releaseCycleLease", () => {
  it("markCycleComplete updates lastCycleAt and clears lease", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, { cycleGeneration: 0 });

    // Acquire lease
    const lease = await t.mutation(internal.agent.internal.acquireCycleLease, {
      traderId: traderId as never,
      expectedGeneration: 0,
      leaseUntil: Date.now() + 90_000,
    });
    expect(lease.acquired).toBe(true);

    const completedAt = Date.now();
    await t.mutation(internal.agent.internal.markCycleComplete, {
      traderId: traderId as never,
      generation: lease.generation,
      lastCycleAt: completedAt,
    });

    const updated = await t.run(async (ctx) => ctx.db.get(traderId as never));
    expect(updated?.lastCycleAt).toBe(completedAt);
    expect(updated?.cycleLeaseUntil).toBeUndefined();
  });

  it("markCycleComplete with stale generation is a no-op", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, {
      cycleGeneration: 3,
      lastCycleAt: 1000,
    });

    await t.mutation(internal.agent.internal.markCycleComplete, {
      traderId: traderId as never,
      generation: 1, // stale
      lastCycleAt: Date.now(),
    });

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    expect(trader?.lastCycleAt).toBe(1000); // unchanged
  });

  it("releaseCycleLease clears lease when generation matches", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, { cycleGeneration: 0 });

    const lease = await t.mutation(internal.agent.internal.acquireCycleLease, {
      traderId: traderId as never,
      expectedGeneration: 0,
      leaseUntil: Date.now() + 90_000,
    });

    await t.mutation(internal.agent.internal.releaseCycleLease, {
      traderId: traderId as never,
      generation: lease.generation,
    });

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    expect(trader?.cycleLeaseUntil).toBeUndefined();
  });

  it("releaseCycleLease with stale generation does not clear active lease", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const futureExpiry = Date.now() + 90_000;
    const traderId = await seedActiveTrader(t, dmId, {
      cycleGeneration: 5,
      cycleLeaseUntil: futureExpiry,
    });

    await t.mutation(internal.agent.internal.releaseCycleLease, {
      traderId: traderId as never,
      generation: 3, // stale
    });

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    expect(trader?.cycleLeaseUntil).toBe(futureExpiry); // unchanged
  });
});

describe("Deal outcome idempotency", () => {
  it("apply returns same id for duplicate (traderId, dealId)", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);
    const dealId = await seedDeal(t);

    const id1 = await t.mutation(internal.dealOutcomes.apply, {
      dealId: dealId as never,
      traderId: traderId as string,
      traderPnlUsdc: 100,
      narrative: "Won big",
    });

    // Duplicate call — should return same id
    const id2 = await t.mutation(internal.dealOutcomes.apply, {
      dealId: dealId as never,
      traderId: traderId as string,
      traderPnlUsdc: 200, // different value — should be ignored
      narrative: "Won again",
    });

    expect(id1).toBe(id2);

    // Verify only one row exists
    const count = await t.run(async (ctx) => {
      const all = await ctx.db.query("dealOutcomes").collect();
      return all.filter(
        (o) => o.traderId === (traderId as string) && o.dealId === dealId
      ).length;
    });
    expect(count).toBe(1);
  });

  it("apply creates separate outcomes for different (traderId, dealId) pairs", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const trader1 = await seedActiveTrader(t, dmId, { name: "Trader A" });
    const trader2 = await seedActiveTrader(t, dmId, { name: "Trader B" });
    const dealId = await seedDeal(t);

    const id1 = await t.mutation(internal.dealOutcomes.apply, {
      dealId: dealId as never,
      traderId: trader1 as string,
      traderPnlUsdc: 100,
    });

    const id2 = await t.mutation(internal.dealOutcomes.apply, {
      dealId: dealId as never,
      traderId: trader2 as string,
      traderPnlUsdc: -50,
    });

    expect(id1).not.toBe(id2);
  });
});

describe("applyOutcomeBalance idempotency", () => {
  it("same outcomeId does not re-apply PnL on retry", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, { escrowBalance: 1000 });
    const dealId = await seedDeal(t);

    // Insert a real outcome row
    const outcomeId = await t.mutation(internal.dealOutcomes.apply, {
      dealId: dealId as never,
      traderId: traderId as string,
      traderPnlUsdc: 200,
    });

    // Apply once
    await t.mutation(internal.traders.applyOutcomeBalance, {
      traderId: traderId as never,
      pnlUsdc: 200,
      wipedOut: false,
      outcomeId: outcomeId as never,
    });

    const afterFirst = await t.run(async (ctx) =>
      ctx.db.get(traderId as never)
    );
    expect(afterFirst?.escrowBalanceUsdc).toBe(1200);

    // Apply again with same outcomeId — should be a no-op
    await t.mutation(internal.traders.applyOutcomeBalance, {
      traderId: traderId as never,
      pnlUsdc: 200,
      wipedOut: false,
      outcomeId: outcomeId as never,
    });

    const afterSecond = await t.run(async (ctx) =>
      ctx.db.get(traderId as never)
    );
    expect(afterSecond?.escrowBalanceUsdc).toBe(1200); // unchanged
  });

  it("wipeout sets trader status to wiped_out", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, { escrowBalance: 100 });
    const dealId = await seedDeal(t);

    const outcomeId = await t.mutation(internal.dealOutcomes.apply, {
      dealId: dealId as never,
      traderId: traderId as string,
      traderPnlUsdc: -100,
      traderWipedOut: true,
    });

    await t.mutation(internal.traders.applyOutcomeBalance, {
      traderId: traderId as never,
      pnlUsdc: -100,
      wipedOut: true,
      outcomeId: outcomeId as never,
    });

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    expect(trader?.status).toBe("wiped_out");
    expect(trader?.escrowBalanceUsdc).toBe(0); // clamped to zero
  });
});

describe("Activity log deduplication", () => {
  it("same dedupeKey produces single row on repeated appends", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);

    const correlationId = "corr-abc123";

    // Append twice with same natural key
    const id1 = await t.mutation(internal.agentActivityLog.append, {
      traderId: traderId as never,
      activityType: "cycle_start",
      message: "Starting cycle",
      correlationId,
    });

    const id2 = await t.mutation(internal.agentActivityLog.append, {
      traderId: traderId as never,
      activityType: "cycle_start",
      message: "Starting cycle (retry)",
      correlationId,
    });

    expect(id1).toBe(id2);

    const rows = await t.run(async (ctx) =>
      ctx.db.query("agentActivityLog").collect()
    );
    expect(rows.length).toBe(1);
  });

  it("explicit eventId deduplication overrides natural key", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);

    const eventId = "evt-unique-001";

    const id1 = await t.mutation(internal.agentActivityLog.append, {
      traderId: traderId as never,
      activityType: "enter",
      message: "Entering deal",
      eventId,
    });

    const id2 = await t.mutation(internal.agentActivityLog.append, {
      traderId: traderId as never,
      activityType: "enter",
      message: "Entering deal (retry)",
      eventId,
    });

    expect(id1).toBe(id2);
  });

  it("different correlationIds produce separate entries", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);

    const id1 = await t.mutation(internal.agentActivityLog.append, {
      traderId: traderId as never,
      activityType: "cycle_start",
      message: "First cycle",
      correlationId: "corr-001",
    });

    const id2 = await t.mutation(internal.agentActivityLog.append, {
      traderId: traderId as never,
      activityType: "cycle_start",
      message: "Second cycle",
      correlationId: "corr-002",
    });

    expect(id1).not.toBe(id2);

    const rows = await t.run(async (ctx) =>
      ctx.db.query("agentActivityLog").collect()
    );
    expect(rows.length).toBe(2);
  });
});

describe("Wallet creation idempotency (at-most-one per trader)", () => {
  it("markCreating only transitions from pending", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);

    // Insert trader with pending wallet
    const traderId = await t.run(async (ctx) => {
      const now = Date.now();
      return ctx.db.insert("traders", {
        deskManagerId: dmId as never,
        ownerSubject: "did:privy:test-subject-001",
        name: "Pending Trader",
        status: "active",
        walletStatus: "pending",
        escrowBalanceUsdc: 0,
        cycleGeneration: 0,
        mandate: {},
        createdAt: now,
        updatedAt: now,
      });
    });

    await t.mutation(internal.traders.markCreating, {
      traderId: traderId as never,
    });

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    expect(trader?.walletStatus).toBe("creating");

    // Calling again when already creating is a no-op
    await t.mutation(internal.traders.markCreating, {
      traderId: traderId as never,
    });

    const trader2 = await t.run(async (ctx) => ctx.db.get(traderId as never));
    expect(trader2?.walletStatus).toBe("creating"); // still creating, not re-transitioned
  });

  it("applyWalletReady does not overwrite a ready wallet", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId); // already "ready"

    await t.mutation(internal.traders.applyWalletReady, {
      traderId: traderId as never,
      cdpWalletAddress: "0xnewaddress",
      cdpOwnerAddress: "0xowner",
      cdpAccountName: "new-account",
      tokenId: 999,
    });

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    // cdpWalletAddress should NOT be updated (CAS guard protects ready state)
    expect(trader?.cdpWalletAddress).toBeUndefined(); // seed doesn't set wallet address
    // walletStatus stays ready
    expect(trader?.walletStatus).toBe("ready");
  });
});
