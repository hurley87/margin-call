/**
 * Behavior tests: agent cycle × trading-hours enforcement (spec §9.4, §5.2, §5.3, §8).
 *
 * Coverage:
 *  - Saturday cycle, no recovery → silent skip, lastCycleAt stamped, no lease,
 *    no activity rows.
 *  - Saturday cycle with a stale `dealEntries` row missing `dealOutcomes` →
 *    proceeds into the recovery path (lease acquired, selectDeal NOT called,
 *    resolveOutcome path reached).
 *  - Monday 09:30 cycle with `lastCycleAt < today's open` → emits exactly one
 *    `market_open` activity row with the correct dedupeKey.
 *  - Two cycle attempts inside the same trading day → only one `market_open`
 *    row (dedupe enforced by the `dedupeKey = ${traderId}-market_open-${date}`
 *    eventId).
 *
 * Time injection: `vi.setSystemTime()` drives the wall clock; the suite-wide
 * `MC_FORCE_MARKET_OPEN=1` env (vitest.config.ts) is unset in `beforeEach`
 * via `useRealMarketHours()` and restored in `afterEach` so honest
 * open/closed branches are exercised.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import {
  getTodayDateNY,
  getTodayOpenMs,
  getTradingHoursState,
} from "../../convex/lib/tradingHours";
import { DEFAULT_CYCLE_INTERVAL_MS } from "../../convex/agent/internal";
import {
  seedDeskManager,
  seedActiveTrader,
  seedDeal,
  useRealMarketHours,
} from "./setup";

const modules = import.meta.glob("../../convex/**/*.ts");

// ── Concrete ET timestamps (2026, EDT = UTC−4) ──────────────────────────────
// Sat 2026-05-09 12:00 ET → 16:00 UTC (weekend, market closed)
const SAT_NOON_ET = Date.UTC(2026, 4, 9, 16, 0, 0);
// Mon 2026-05-04 09:30 ET → 13:30 UTC (market just opened)
const MON_OPEN_ET = Date.UTC(2026, 4, 4, 13, 30, 0);

// ── Saturday: silent skip when there is no recovery work ────────────────────

describe("Agent cycle: market closed, no recovery work → silent skip", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = useRealMarketHours();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(SAT_NOON_ET));
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreEnv();
  });

  it("stamps lastCycleAt, does not acquire a lease, and writes no activity rows", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, {
      cycleGeneration: 0,
      lastCycleAt: undefined,
    });

    await t.action(internal.agent.cycle.cycle, {
      traderId: traderId as never,
    });

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    // Stamp lands on `nextOpenAt - DEFAULT_CYCLE_INTERVAL_MS` so the scheduler
    // keeps the trader idle until just before the next open (instead of
    // re-firing every 10 min through the weekend).
    const { nextOpenAt } = getTradingHoursState(SAT_NOON_ET);
    expect(nextOpenAt).toBeDefined();
    expect(trader?.lastCycleAt).toBe(
      (nextOpenAt as number) - DEFAULT_CYCLE_INTERVAL_MS
    );
    expect(trader?.cycleGeneration).toBe(0); // no lease bump
    expect(trader?.cycleLeaseUntil).toBeUndefined();

    const rows = await t.run(async (ctx) =>
      ctx.db.query("agentActivityLog").collect()
    );
    expect(rows.length).toBe(0);
  });
});

// ── Saturday: with orphaned dealEntries < 24h old → recovery path ───────────

describe("Agent cycle: market closed with recovery work → resolveOutcome path", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = useRealMarketHours();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(SAT_NOON_ET));
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreEnv();
  });

  it("acquires lease, skips selectDeal, and reaches resolveOutcome path", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, {
      cycleGeneration: 0,
    });
    const dealId = await seedDeal(t, {
      prompt: "Recovery target",
      potUsdc: 200,
      entryCostUsdc: 25,
    });

    // Insert an orphan dealEntry (paid but no outcome row), 1h old → within 24h scope.
    await t.run(async (ctx) => {
      const now = Date.now();
      return ctx.db.insert("dealEntries", {
        paymentId: "recovery-payment-xyz",
        dealId: dealId as never,
        traderId: traderId as string,
        entryCostUsdc: 25,
        createdAt: now - 60 * 60_000,
      });
    });

    // Recovery probe should flag this trader as needing work.
    const recoveryEntry = await t.query(
      internal.agent.internal.findPendingRecoveryEntry,
      { traderId: traderId as never }
    );
    expect(recoveryEntry).not.toBeNull();

    // Run the cycle. The resolveOutcome path will throw because there is no
    // OPENAI_API_KEY in the test env — that's expected. We verify the recovery
    // branch was taken by inspecting downstream state.
    await expect(
      t.action(internal.agent.cycle.cycle, { traderId: traderId as never })
    ).rejects.toThrow();

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    // Lease was acquired (generation bumped) and then released by the error
    // handler. lastCycleAt is not stamped because markCycleComplete never ran.
    expect(trader?.cycleGeneration).toBe(1);
    expect(trader?.cycleLeaseUntil).toBeUndefined();
    expect(trader?.lastCycleAt).toBeUndefined();

    const rows = await t.run(async (ctx) =>
      ctx.db.query("agentActivityLog").collect()
    );
    // selectDeal MUST NOT have run while market is closed.
    expect(rows.find((r) => r.activityType === "evaluate")).toBeUndefined();
    // Likewise, no entry-attempt log (callDealEnter is gated).
    expect(rows.find((r) => r.activityType === "enter")).toBeUndefined();
    // No `market_open` event (market is closed).
    expect(rows.find((r) => r.activityType === "market_open")).toBeUndefined();
    // The error handler should have logged a `cycle_error` row.
    expect(rows.find((r) => r.activityType === "cycle_error")).toBeDefined();

    // The outcome row should NOT exist — resolveOutcome threw before persisting.
    const outcome = await t.query(internal.dealOutcomes.findByTraderAndDeal, {
      traderId: traderId as string,
      dealId: dealId as never,
    });
    expect(outcome).toBeNull();
  });

  it("findPendingRecoveryEntry ignores entries older than 24h", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);
    const dealId = await seedDeal(t);

    // Insert an orphan dealEntry from 25h ago — outside the 24h recovery scope.
    await t.run(async (ctx) =>
      ctx.db.insert("dealEntries", {
        paymentId: "stale-payment",
        dealId: dealId as never,
        traderId: traderId as string,
        entryCostUsdc: 10,
        createdAt: Date.now() - 25 * 60 * 60_000,
      })
    );

    const recoveryEntry = await t.query(
      internal.agent.internal.findPendingRecoveryEntry,
      { traderId: traderId as never }
    );
    expect(recoveryEntry).toBeNull();
  });

  it("findPendingRecoveryEntry returns null when the dealOutcome already exists", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);
    const dealId = await seedDeal(t);

    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("dealEntries", {
        paymentId: "resolved-payment",
        dealId: dealId as never,
        traderId: traderId as string,
        entryCostUsdc: 10,
        createdAt: now - 60_000,
      });
      await ctx.db.insert("dealOutcomes", {
        dealId: dealId as never,
        traderId: traderId as string,
        traderPnlUsdc: 5,
        createdAt: now - 30_000,
      });
    });

    const recoveryEntry = await t.query(
      internal.agent.internal.findPendingRecoveryEntry,
      { traderId: traderId as never }
    );
    expect(recoveryEntry).toBeNull();
  });
});

// ── Monday 09:30: first cycle of the trading day emits one `market_open` row ─

describe("Agent cycle: market_open activity event", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = useRealMarketHours();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(MON_OPEN_ET));
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreEnv();
  });

  it("appends exactly one market_open row with the expected dedupeKey", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, {
      cycleGeneration: 0,
      lastCycleAt: undefined, // never cycled before → first cycle of the day
    });

    await t.action(internal.agent.cycle.cycle, {
      traderId: traderId as never,
    });

    const todayDateNY = getTodayDateNY(MON_OPEN_ET);
    const expectedDedupeKey = `${traderId}-market_open-${todayDateNY}`;

    const marketOpenRows = await t.run(async (ctx) =>
      (await ctx.db.query("agentActivityLog").collect()).filter(
        (r) => r.activityType === "market_open"
      )
    );
    expect(marketOpenRows.length).toBe(1);
    expect(marketOpenRows[0]!.message).toBe("Cycle resumed at market open");
    expect(marketOpenRows[0]!.dedupeKey).toBe(expectedDedupeKey);

    // Sanity: market_open was emitted before the cycle proceeded into selectDeal.
    const rows = await t.run(async (ctx) =>
      ctx.db.query("agentActivityLog").collect()
    );
    const evaluateRow = rows.find((r) => r.activityType === "evaluate");
    // With no seeded open deals selectDeal still runs (it queries open deals
    // and returns "no deal selected"), producing an `evaluate` row.
    expect(evaluateRow).toBeDefined();
  });

  it("does not emit market_open when lastCycleAt is already past today's open", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);

    // Simulate: trader already cycled once today at 09:31 ET.
    const todayOpenMs = getTodayOpenMs(MON_OPEN_ET);
    const traderId = await seedActiveTrader(t, dmId, {
      cycleGeneration: 0,
      lastCycleAt: todayOpenMs + 60_000, // 1 minute past open
    });

    // listStaleTradersForCycle would normally skip this trader (10-min spacing)
    // but the cycle action itself doesn't gate on that — it just runs. We're
    // exercising the market_open-emit predicate directly here.
    await t.action(internal.agent.cycle.cycle, {
      traderId: traderId as never,
    });

    const marketOpenRows = await t.run(async (ctx) =>
      (await ctx.db.query("agentActivityLog").collect()).filter(
        (r) => r.activityType === "market_open"
      )
    );
    expect(marketOpenRows.length).toBe(0);
  });

  it("dedupes market_open across two cycles in the same trading day", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, {
      cycleGeneration: 0,
      lastCycleAt: undefined,
    });

    // First cycle — should emit one market_open row.
    await t.action(internal.agent.cycle.cycle, {
      traderId: traderId as never,
    });

    // Force a second cycle to attempt the market_open append by resetting the
    // trader's lastCycleAt and lease. The dedupeKey must guarantee idempotency
    // even if both attempts hit the activity log.
    await t.run(async (ctx) => {
      await ctx.db.patch(traderId as never, {
        lastCycleAt: undefined,
        cycleLeaseUntil: undefined,
      });
    });

    await t.action(internal.agent.cycle.cycle, {
      traderId: traderId as never,
    });

    const marketOpenRows = await t.run(async (ctx) =>
      (await ctx.db.query("agentActivityLog").collect()).filter(
        (r) => r.activityType === "market_open"
      )
    );
    expect(marketOpenRows.length).toBe(1);
  });
});

// ── stampLastCycleAt ────────────────────────────────────────────────────────

describe("stampLastCycleAt", () => {
  it("patches lastCycleAt without bumping generation or taking a lease", async () => {
    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, {
      cycleGeneration: 3,
      lastCycleAt: undefined,
    });

    const stampAt = 1_700_000_000_000;
    await t.mutation(internal.agent.internal.stampLastCycleAt, {
      traderId: traderId as never,
      lastCycleAt: stampAt,
    });

    const trader = await t.run(async (ctx) => ctx.db.get(traderId as never));
    expect(trader?.lastCycleAt).toBe(stampAt);
    expect(trader?.cycleGeneration).toBe(3); // unchanged
    expect(trader?.cycleLeaseUntil).toBeUndefined();
  });
});
