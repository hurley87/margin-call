/**
 * Phase 3 ($BLOW capacity) — scheduler/cycle capacity gates (issue #190).
 *
 * Covers: tier transitions, exact cadence boundaries, unresolved-entry caps,
 * stale read-model vs RPC, RPC failure fail-closed, lease races, and
 * idempotent settlement remaining ungated by capacity.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import { DEFAULT_CYCLE_INTERVAL_MS } from "../../convex/agent/internal";
import {
  GALLERY_CYCLE_INTERVAL_MS,
  MIN_CYCLE_INTERVAL_MS,
  capacityFromTier,
  failClosedGallery,
  isCycleIntervalElapsed,
  resolveAuthoritativeCapacity,
  setTierOfReaderForTests,
} from "../../convex/agent/capacity";
import { TIER_CAPACITY } from "../../convex/seatVault/policy";
import { SEAT_VAULT_V1 } from "../../convex/seatVault/policy";
import { MAX_CYCLES_PER_SCHEDULER_TICK } from "../../convex/agent/scheduler";
import {
  seedActiveTrader,
  seedDeal,
  seedDeskManager,
  useRealMarketHours,
} from "./setup";
import type { SeatTierName } from "../../convex/seatVault/policy";

const modules = import.meta.glob("../../convex/**/*.ts");

// Mon 2026-05-04 10:00 ET → 14:00 UTC.
const MON_10_ET = Date.UTC(2026, 4, 4, 14, 0, 0);

const VAULT = SEAT_VAULT_V1.address.toLowerCase();

describe("capacity pure helpers", () => {
  it("maps tiers to cadence and unresolved caps", () => {
    expect(capacityFromTier("Gallery")).toMatchObject({
      cycleIntervalMs: 10 * 60_000,
      maxUnresolvedEntries: 1,
      source: "rpc",
    });
    expect(capacityFromTier("Seat")).toMatchObject({
      cycleIntervalMs: 5 * 60_000,
      maxUnresolvedEntries: 1,
    });
    expect(capacityFromTier("CornerOffice")).toMatchObject({
      cycleIntervalMs: 5 * 60_000,
      maxUnresolvedEntries: 2,
    });
    expect(GALLERY_CYCLE_INTERVAL_MS).toBe(DEFAULT_CYCLE_INTERVAL_MS);
    expect(MIN_CYCLE_INTERVAL_MS).toBe(TIER_CAPACITY.Seat.cycleIntervalMs);
  });

  it("treats exact cadence boundary as elapsed", () => {
    const now = 1_000_000;
    const interval = 5 * 60_000;
    expect(isCycleIntervalElapsed(now - interval, now, interval)).toBe(true);
    expect(isCycleIntervalElapsed(now - interval + 1, now, interval)).toBe(
      false
    );
    expect(isCycleIntervalElapsed(undefined, now, interval)).toBe(true);
  });

  it("fail-closes to Gallery on missing config / RPC / malformed tier", async () => {
    expect(failClosedGallery("x")).toMatchObject({
      tier: "Gallery",
      source: "fail_closed",
      diagnostic: "x",
    });

    expect(
      await resolveAuthoritativeCapacity({
        onChainTraderId: undefined,
        vaultAddress: VAULT,
      })
    ).toMatchObject({ tier: "Gallery", diagnostic: "missing_token_id" });

    expect(
      await resolveAuthoritativeCapacity({
        onChainTraderId: 1,
        vaultAddress: null,
      })
    ).toMatchObject({
      tier: "Gallery",
      diagnostic: "missing_or_invalid_vault",
    });

    expect(
      await resolveAuthoritativeCapacity({
        onChainTraderId: 1,
        vaultAddress: VAULT,
        readTierOf: async () => {
          throw new Error("rpc down");
        },
      })
    ).toMatchObject({
      tier: "Gallery",
      source: "fail_closed",
    });

    expect(
      await resolveAuthoritativeCapacity({
        onChainTraderId: 1,
        vaultAddress: VAULT,
        readTierOf: async () => "NotATier" as SeatTierName,
      })
    ).toMatchObject({
      tier: "Gallery",
      diagnostic: expect.stringContaining("malformed_tier"),
    });
  });
});

describe("countUnresolvedEntries", () => {
  it("counts entries missing outcomes or on-chain settlement", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, { tokenId: 11 });
    const dealA = await seedDeal(t, { onChainDealId: 1 });
    const dealB = await seedDeal(t, { onChainDealId: 2 });
    const dealC = await seedDeal(t, { onChainDealId: 3 });
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("dealEntries", {
        paymentId: "pay-a",
        dealId: dealA as never,
        traderId: traderId as never,
        entryCostUsdc: 10,
        createdAt: now - 1_000,
      });
      await ctx.db.insert("dealEntries", {
        paymentId: "pay-b",
        dealId: dealB as never,
        traderId: traderId as never,
        entryCostUsdc: 10,
        createdAt: now - 2_000,
      });
      await ctx.db.insert("dealOutcomes", {
        dealId: dealB as never,
        traderId: traderId as never,
        traderPnlUsdc: 1,
        createdAt: now - 1_500,
        // no onChainTxHash → still unresolved
      });
      await ctx.db.insert("dealEntries", {
        paymentId: "pay-c",
        dealId: dealC as never,
        traderId: traderId as never,
        entryCostUsdc: 10,
        createdAt: now - 3_000,
      });
      await ctx.db.insert("dealOutcomes", {
        dealId: dealC as never,
        traderId: traderId as never,
        traderPnlUsdc: 1,
        onChainTxHash: "0xsettled",
        createdAt: now - 2_500,
      });
    });

    const count = await t.query(
      internal.agent.capacity.countUnresolvedEntries,
      { traderId: traderId as never, now }
    );
    expect(count).toBe(2);
  });
});

describe("scheduler authoritative capacity", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = useRealMarketHours();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(MON_10_ET));
  });

  afterEach(() => {
    setTierOfReaderForTests(undefined);
    vi.useRealTimers();
    restoreEnv();
  });

  async function seedVault(t: ReturnType<typeof convexTest>) {
    await t.mutation(internal.seatVault.store.ensureActiveVaultDeployment, {
      address: VAULT,
      version: 1,
    });
  }

  it("keeps Gallery on 10-minute cadence at the exact boundary", async () => {
    const t = convexTest(schema, modules);
    await seedVault(t);
    const dmId = await seedDeskManager(t);
    await seedActiveTrader(t, dmId, {
      tokenId: 1,
      lastCycleAt: MON_10_ET - GALLERY_CYCLE_INTERVAL_MS,
    });
    setTierOfReaderForTests(async () => "Gallery");

    const result = await t.action(internal.agent.scheduler.scheduler, {});
    expect(result).toEqual({ enqueued: 1, skipped: null });
  });

  it("does not enqueue Gallery one ms inside the 10-minute window", async () => {
    const t = convexTest(schema, modules);
    await seedVault(t);
    const dmId = await seedDeskManager(t);
    await seedActiveTrader(t, dmId, {
      tokenId: 2,
      // Past 5m pre-filter, still inside Gallery 10m.
      lastCycleAt: MON_10_ET - (GALLERY_CYCLE_INTERVAL_MS - 1),
    });
    setTierOfReaderForTests(async () => "Gallery");

    const result = await t.action(internal.agent.scheduler.scheduler, {});
    expect(result).toEqual({ enqueued: 0, skipped: "no_eligible_traders" });
  });

  it("enqueues Seat at the exact 5-minute boundary", async () => {
    const t = convexTest(schema, modules);
    await seedVault(t);
    const dmId = await seedDeskManager(t);
    await seedActiveTrader(t, dmId, {
      tokenId: 3,
      lastCycleAt: MON_10_ET - MIN_CYCLE_INTERVAL_MS,
    });
    setTierOfReaderForTests(async () => "Seat");

    const result = await t.action(internal.agent.scheduler.scheduler, {});
    expect(result).toEqual({ enqueued: 1, skipped: null });
  });

  it("enqueues Corner Office at the exact 5-minute boundary", async () => {
    const t = convexTest(schema, modules);
    await seedVault(t);
    const dmId = await seedDeskManager(t);
    await seedActiveTrader(t, dmId, {
      tokenId: 4,
      lastCycleAt: MON_10_ET - MIN_CYCLE_INTERVAL_MS,
    });
    setTierOfReaderForTests(async () => "CornerOffice");

    const result = await t.action(internal.agent.scheduler.scheduler, {});
    expect(result).toEqual({ enqueued: 1, skipped: null });
  });

  it("applies a tier upgrade at the next scheduler tick without restart", async () => {
    const t = convexTest(schema, modules);
    await seedVault(t);
    const dmId = await seedDeskManager(t);
    await seedActiveTrader(t, dmId, {
      tokenId: 5,
      lastCycleAt: MON_10_ET - MIN_CYCLE_INTERVAL_MS - 1_000,
    });

    let tier: SeatTierName = "Gallery";
    setTierOfReaderForTests(async () => tier);

    const blocked = await t.action(internal.agent.scheduler.scheduler, {});
    expect(blocked).toEqual({ enqueued: 0, skipped: "no_eligible_traders" });

    tier = "Seat";
    const allowed = await t.action(internal.agent.scheduler.scheduler, {});
    expect(allowed).toEqual({ enqueued: 1, skipped: null });
  });

  it("ignores stale Corner Office read-model when RPC says Gallery", async () => {
    const t = convexTest(schema, modules);
    await seedVault(t);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, {
      tokenId: 6,
      lastCycleAt: MON_10_ET - MIN_CYCLE_INTERVAL_MS - 1_000,
    });

    await t.mutation(internal.seatVault.store.publishReconciledSeatState, {
      traderId: traderId as never,
      onChainTraderId: 6,
      vaultAddress: VAULT,
      vaultVersion: 1,
      isActiveVault: true,
      effectiveTier: "CornerOffice",
      staker: "0xabcabcabcabcabcabcabcabcabcabcabcabcabca",
      activeAmountWei: "50000000000000000000000",
      pendingAmountWei: "0",
      unlockTime: 0,
      syncStatus: "ok",
      syncError: null,
    });

    setTierOfReaderForTests(async () => "Gallery");
    const result = await t.action(internal.agent.scheduler.scheduler, {});
    expect(result).toEqual({ enqueued: 0, skipped: "no_eligible_traders" });
  });

  it("fail-closes to Gallery cadence on RPC failure (no accelerated enqueue)", async () => {
    const t = convexTest(schema, modules);
    await seedVault(t);
    const dmId = await seedDeskManager(t);
    await seedActiveTrader(t, dmId, {
      tokenId: 7,
      lastCycleAt: MON_10_ET - MIN_CYCLE_INTERVAL_MS - 1_000,
    });
    setTierOfReaderForTests(async () => {
      throw new Error("boom");
    });

    const result = await t.action(internal.agent.scheduler.scheduler, {});
    expect(result).toEqual({ enqueued: 0, skipped: "no_eligible_traders" });
  });

  it("still respects per-tick fanout after capacity filtering", async () => {
    const t = convexTest(schema, modules);
    await seedVault(t);
    const dmId = await seedDeskManager(t);
    setTierOfReaderForTests(async () => "Seat");

    for (let i = 0; i < MAX_CYCLES_PER_SCHEDULER_TICK + 3; i += 1) {
      await seedActiveTrader(t, dmId, {
        name: `Seat ${i}`,
        tokenId: 100 + i,
        lastCycleAt: MON_10_ET - MIN_CYCLE_INTERVAL_MS - 1_000,
      });
    }

    const result = await t.action(internal.agent.scheduler.scheduler, {});
    expect(result).toEqual({
      enqueued: MAX_CYCLES_PER_SCHEDULER_TICK,
      skipped: null,
    });
  });
});

describe("cycle capacity gates", () => {
  let priorForceOpen: string | undefined;

  beforeEach(() => {
    priorForceOpen = process.env.MC_FORCE_MARKET_OPEN;
    process.env.MC_FORCE_MARKET_OPEN = "1";
    vi.useFakeTimers();
    vi.setSystemTime(new Date(MON_10_ET));
  });

  afterEach(() => {
    setTierOfReaderForTests(undefined);
    vi.useRealTimers();
    if (priorForceOpen === undefined) {
      delete process.env.MC_FORCE_MARKET_OPEN;
    } else {
      process.env.MC_FORCE_MARKET_OPEN = priorForceOpen;
    }
  });

  async function seedVault(t: ReturnType<typeof convexTest>) {
    await t.mutation(internal.seatVault.store.ensureActiveVaultDeployment, {
      address: VAULT,
      version: 1,
    });
  }

  it("blocks new entries at Gallery/Seat unresolved cap of 1", async () => {
    const t = convexTest(schema, modules);
    await seedVault(t);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, {
      tokenId: 20,
      lastCycleAt: undefined,
      cycleGeneration: 0,
    });
    const dealId = await seedDeal(t, { onChainDealId: 20 });
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("dealEntries", {
        paymentId: "cap-1",
        dealId: dealId as never,
        traderId: traderId as never,
        entryCostUsdc: 10,
        createdAt: now - 1_000,
      });
    });

    setTierOfReaderForTests(async () => "Seat");
    await t.action(internal.agent.cycle.cycle, {
      traderId: traderId as never,
    });

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("agentActivityLog")
        .withIndex("byTrader", (q) => q.eq("traderId", traderId as never))
        .collect()
    );
    const capEnd = rows.find(
      (r) =>
        r.activityType === "cycle_end" &&
        r.message.includes("unresolved entry cap")
    );
    expect(capEnd).toBeDefined();
    expect(rows.some((r) => r.activityType === "enter")).toBe(false);
  });

  it("allows Corner Office a second unresolved entry (cap 2)", async () => {
    const t = convexTest(schema, modules);
    await seedVault(t);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, { tokenId: 21 });
    const dealId = await seedDeal(t, { onChainDealId: 21 });
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("dealEntries", {
        paymentId: "cap-co-1",
        dealId: dealId as never,
        traderId: traderId as never,
        entryCostUsdc: 10,
        createdAt: now - 1_000,
      });
    });

    const count = await t.query(
      internal.agent.capacity.countUnresolvedEntries,
      {
        traderId: traderId as never,
        now,
      }
    );
    expect(count).toBe(1);
    expect(capacityFromTier("CornerOffice").maxUnresolvedEntries).toBe(2);
    expect(count < capacityFromTier("CornerOffice").maxUnresolvedEntries).toBe(
      true
    );
  });

  it("blocks Corner Office at unresolved cap of 2", async () => {
    const t = convexTest(schema, modules);
    await seedVault(t);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, {
      tokenId: 22,
      lastCycleAt: undefined,
      cycleGeneration: 0,
    });
    const dealA = await seedDeal(t, { onChainDealId: 22 });
    const dealB = await seedDeal(t, { onChainDealId: 23 });
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("dealEntries", {
        paymentId: "cap-co-a",
        dealId: dealA as never,
        traderId: traderId as never,
        entryCostUsdc: 10,
        createdAt: now - 2_000,
      });
      await ctx.db.insert("dealEntries", {
        paymentId: "cap-co-b",
        dealId: dealB as never,
        traderId: traderId as never,
        entryCostUsdc: 10,
        createdAt: now - 1_000,
      });
    });

    setTierOfReaderForTests(async () => "CornerOffice");
    await t.action(internal.agent.cycle.cycle, {
      traderId: traderId as never,
    });

    const rows = await t.run(async (ctx) =>
      ctx.db.query("agentActivityLog").collect()
    );
    expect(
      rows.some(
        (r) =>
          r.activityType === "cycle_end" &&
          r.message.includes("unresolved entry cap")
      )
    ).toBe(true);
  });

  it("logs a diagnostic when tier RPC fails closed", async () => {
    const t = convexTest(schema, modules);
    await seedVault(t);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, {
      tokenId: 23,
      // Inside Gallery cadence so cycle exits after diagnostic (no selectDeal).
      lastCycleAt: Date.now() - 60_000,
      cycleGeneration: 0,
    });
    setTierOfReaderForTests(async () => {
      throw new Error("rpc unavailable");
    });

    await t.action(internal.agent.cycle.cycle, {
      traderId: traderId as never,
    });

    const rows = await t.run(async (ctx) =>
      ctx.db.query("agentActivityLog").collect()
    );
    expect(
      rows.some(
        (r) =>
          r.activityType === "capacity_diagnostic" &&
          r.message.includes("failed closed to Gallery")
      )
    ).toBe(true);
    expect(rows.some((r) => r.activityType === "enter")).toBe(false);
  });

  it("lease CAS still prevents overlapping cycles under capacity", async () => {
    const t = convexTest(schema, modules);
    await seedVault(t);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, {
      tokenId: 24,
      cycleGeneration: 0,
      lastCycleAt: undefined,
    });
    setTierOfReaderForTests(async () => "Seat");

    const first = await t.mutation(internal.agent.internal.acquireCycleLease, {
      traderId: traderId as never,
      expectedGeneration: 0,
      leaseUntil: Date.now() + 60_000,
    });
    expect(first.acquired).toBe(true);

    const second = await t.mutation(internal.agent.internal.acquireCycleLease, {
      traderId: traderId as never,
      expectedGeneration: 0,
      leaseUntil: Date.now() + 60_000,
    });
    expect(second.acquired).toBe(false);

    // Concurrent cycle invocations lose the lease race.
    await t.action(internal.agent.cycle.cycle, {
      traderId: traderId as never,
    });
    const trader = await t.run((ctx) => ctx.db.get(traderId as never));
    expect(trader?.cycleGeneration).toBe(1);
  });

  it("does not gate §3c-style settlement by entry caps (idempotent settle path)", async () => {
    // Capacity caps only block NEW entries. An existing outcome waiting for
    // on-chain settlement must remain recoverable — countUnresolved includes it,
    // but findUnresolvedOnChain / markOnChainResolved stay independent.
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, { tokenId: 25 });
    const dealId = await seedDeal(t, { onChainDealId: 25 });
    const now = Date.now();

    const outcomeId = await t.run(async (ctx) => {
      await ctx.db.insert("dealEntries", {
        paymentId: "settle-1",
        dealId: dealId as never,
        traderId: traderId as never,
        entryCostUsdc: 10,
        createdAt: now - 1_000,
      });
      return ctx.db.insert("dealOutcomes", {
        dealId: dealId as never,
        traderId: traderId as never,
        traderPnlUsdc: 5,
        rakeUsdc: 0.5,
        createdAt: now - 500,
      });
    });

    const unresolved = await t.query(
      internal.agent.capacity.countUnresolvedEntries,
      { traderId: traderId as never, now }
    );
    expect(unresolved).toBe(1);

    await t.mutation(internal.dealOutcomes.markOnChainResolved, {
      outcomeId: outcomeId as never,
      onChainTxHash: "0xabc",
    });
    await t.mutation(internal.dealOutcomes.markOnChainResolved, {
      outcomeId: outcomeId as never,
      onChainTxHash: "0xshould-not-overwrite",
    });

    const outcome = await t.run((ctx) => ctx.db.get(outcomeId as never));
    expect(outcome?.onChainTxHash).toBe("0xabc");

    const after = await t.query(
      internal.agent.capacity.countUnresolvedEntries,
      { traderId: traderId as never, now }
    );
    expect(after).toBe(0);
  });
});
