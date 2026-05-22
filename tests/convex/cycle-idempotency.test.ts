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

import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import { DEFAULT_CYCLE_INTERVAL_MS } from "../../convex/agent/internal";
import { seedDeskManager, seedActiveTrader, seedDeal } from "./setup";

const modules = import.meta.glob("../../convex/**/*.ts");

// Some tests in this file call `recordVerifiedEntry`, which now enforces
// trading hours. Force market-open for the file so wall-clock time doesn't
// break unrelated assertions.
const PRIOR_FORCE_OPEN = process.env.MC_FORCE_MARKET_OPEN;
beforeAll(() => {
  process.env.MC_FORCE_MARKET_OPEN = "1";
});
afterAll(() => {
  if (PRIOR_FORCE_OPEN === undefined) {
    delete process.env.MC_FORCE_MARKET_OPEN;
  } else {
    process.env.MC_FORCE_MARKET_OPEN = PRIOR_FORCE_OPEN;
  }
});

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

  it("returns stale trader (lastCycleAt past default interval) as eligible", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const oldCycleAt = Date.now() - DEFAULT_CYCLE_INTERVAL_MS;
    await seedActiveTrader(t, dmId, { lastCycleAt: oldCycleAt });

    const stale = await t.query(
      internal.agent.internal.listStaleTradersForCycle,
      {}
    );
    expect(stale.length).toBe(1);
  });

  it("does NOT return trader with lastCycleAt within default cycle interval", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const freshCycleAt = Date.now() - 10_000; // well inside the default interval
    await seedActiveTrader(t, dmId, { lastCycleAt: freshCycleAt });

    const stale = await t.query(
      internal.agent.internal.listStaleTradersForCycle,
      {}
    );
    expect(stale.length).toBe(0);
  });

  it("does NOT return trader whose lastCycleAt is just inside the cycle interval (boundary: still fresh)", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const justInsideInterval =
      Date.now() - (DEFAULT_CYCLE_INTERVAL_MS - 60_000);
    await seedActiveTrader(t, dmId, { lastCycleAt: justInsideInterval });

    const stale = await t.query(
      internal.agent.internal.listStaleTradersForCycle,
      {}
    );
    expect(stale.length).toBe(0);
  });

  it("returns trader whose lastCycleAt is older than default interval by a margin", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const wellPastInterval = Date.now() - DEFAULT_CYCLE_INTERVAL_MS - 1_000;
    await seedActiveTrader(t, dmId, { lastCycleAt: wellPastInterval });

    const stale = await t.query(
      internal.agent.internal.listStaleTradersForCycle,
      {}
    );
    expect(stale.length).toBe(1);
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

  it("does NOT return active ready traders without funding", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    await seedActiveTrader(t, dmId, { escrowBalance: 0 });

    const stale = await t.query(
      internal.agent.internal.listStaleTradersForCycle,
      {}
    );
    expect(stale.length).toBe(0);
  });

  it("cycle skips active ready traders without funding", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, { escrowBalance: 0 });

    await t.action(internal.agent.cycle.cycle, {
      traderId: traderId as never,
    });

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    expect(trader?.lastCycleAt).toBeUndefined();
    expect(trader?.cycleLeaseUntil).toBeUndefined();
    expect(trader?.cycleGeneration).toBe(0);
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

  it("loss outcome increases deal pot and wipeout count once", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);
    const dealId = await seedDeal(t, { potUsdc: 5, entryCostUsdc: 1 });

    const id1 = await t.mutation(internal.dealOutcomes.apply, {
      dealId: dealId as never,
      traderId: traderId as string,
      traderPnlUsdc: -10,
      traderWipedOut: true,
    });
    const id2 = await t.mutation(internal.dealOutcomes.apply, {
      dealId: dealId as never,
      traderId: traderId as string,
      traderPnlUsdc: -10,
      traderWipedOut: true,
    });

    expect(id2).toBe(id1);

    const deal = await t.run(async (ctx) => ctx.db.get(dealId as never));
    expect(deal?.potUsdc).toBe(15);
    expect(deal?.wipeoutCount).toBe(1);

    const outcome = await t.run(async (ctx) => ctx.db.get(id1 as never));
    expect(outcome?.potChangeUsdc).toBe(10);
  });

  it("win outcome decreases deal pot by gross winnings including rake", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);
    const dealId = await seedDeal(t, { potUsdc: 100 });

    await t.mutation(internal.dealOutcomes.apply, {
      dealId: dealId as never,
      traderId: traderId as string,
      traderPnlUsdc: 9,
      rakeUsdc: 1,
    });

    const deal = await t.run(async (ctx) => ctx.db.get(dealId as never));
    expect(deal?.potUsdc).toBe(90);
    expect(deal?.wipeoutCount ?? 0).toBe(0);
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
      outcomeId: outcomeId as never,
    });

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    expect(trader?.status).toBe("wiped_out");
    expect(trader?.escrowBalanceUsdc).toBe(0); // clamped to zero
  });

  it("does not wipe out when a normal deal loss leaves balance positive", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, { escrowBalance: 10 });
    const dealId = await seedDeal(t, { entryCostUsdc: 1 });

    const outcomeId = await t.mutation(internal.dealOutcomes.apply, {
      dealId: dealId as never,
      traderId: traderId as string,
      traderPnlUsdc: -1,
      traderWipedOut: true,
    });

    await t.mutation(internal.traders.applyOutcomeBalance, {
      traderId: traderId as never,
      pnlUsdc: -1,
      outcomeId: outcomeId as never,
    });

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    expect(trader?.status).toBe("active");
    expect(trader?.escrowBalanceUsdc).toBe(9);
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

describe("Verified deal entry lookup (agent cycle idempotency)", () => {
  it("findVerifiedEntryByTraderAndDeal returns the entry row", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);
    const dealId = await seedDeal(t);

    await t.mutation(internal.deals.recordVerifiedEntry, {
      paymentId: "test-payment-xyz",
      dealId: dealId as never,
      traderId: traderId as string,
      entryCostUsdc: 50,
    });

    const found = await t.query(
      internal.deals.findVerifiedEntryByTraderAndDeal,
      {
        traderId: traderId as string,
        dealId: dealId as never,
      }
    );

    expect(found).not.toBeNull();
    expect(found?.paymentId).toBe("test-payment-xyz");
  });

  it("replay-safe: duplicate recordVerifiedEntry paymentId returns existing id", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);
    const dealId = await seedDeal(t);

    const id1 = await t.mutation(internal.deals.recordVerifiedEntry, {
      paymentId: "same-key",
      dealId: dealId as never,
      traderId: traderId as string,
      entryCostUsdc: 50,
    });
    const id2 = await t.mutation(internal.deals.recordVerifiedEntry, {
      paymentId: "same-key",
      dealId: dealId as never,
      traderId: traderId as string,
      entryCostUsdc: 99,
    });
    expect(id1).toBe(id2);
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

    const before = await t.run(async (ctx) => ctx.db.get(traderId as never));
    if (!before) throw new Error("Trader not found");

    await t.mutation(internal.traders.markCreating, {
      traderId: traderId as never,
      expectedUpdatedAt: before.updatedAt,
    });

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    expect(trader?.walletStatus).toBe("creating");

    // Calling again with the stale snapshot is a no-op (CAS mismatch on updatedAt)
    await t.mutation(internal.traders.markCreating, {
      traderId: traderId as never,
      expectedUpdatedAt: before.updatedAt,
    });

    const trader2 = await t.run(async (ctx) => ctx.db.get(traderId as never));
    expect(trader2?.walletStatus).toBe("creating"); // still creating, not re-transitioned
  });

  it("markCreating CAS denies stale lock acquisition", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);

    const traderId = await t.run(async (ctx) => {
      const now = Date.now();
      return ctx.db.insert("traders", {
        deskManagerId: dmId as never,
        ownerSubject: "did:privy:test-subject-001",
        name: "CAS Pending Trader",
        status: "active",
        walletStatus: "pending",
        escrowBalanceUsdc: 0,
        cycleGeneration: 0,
        mandate: {},
        createdAt: now,
        updatedAt: now,
      });
    });

    const before = await t.run(async (ctx) => ctx.db.get(traderId as never));
    expect(before).toBeTruthy();
    if (!before) throw new Error("Trader not found");

    const first = await t.mutation(internal.traders.markCreating, {
      traderId: traderId as never,
      expectedUpdatedAt: before.updatedAt,
    });
    expect(first).toBe(true);

    const second = await t.mutation(internal.traders.markCreating, {
      traderId: traderId as never,
      expectedUpdatedAt: before.updatedAt,
    });
    expect(second).toBe(false);
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
