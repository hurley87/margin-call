import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import { DEFAULT_CYCLE_INTERVAL_MS } from "../../convex/agent/internal";
import { MAX_CYCLES_PER_SCHEDULER_TICK } from "../../convex/agent/scheduler";
import { seedActiveTrader, seedDeskManager, useRealMarketHours } from "./setup";

const modules = import.meta.glob("../../convex/**/*.ts");

// Sat 2026-05-09 12:00 ET -> 16:00 UTC.
const SAT_NOON_ET = Date.UTC(2026, 4, 9, 16, 0, 0);
// Mon 2026-05-04 10:00 ET -> 14:00 UTC.
const MON_10_ET = Date.UTC(2026, 4, 4, 14, 0, 0);

describe("agent scheduler cost controls", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = useRealMarketHours();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreEnv();
  });

  it("exits when AGENT_CYCLES_ENABLED is not 1 (Gate 3 autonomy off)", async () => {
    vi.setSystemTime(new Date(MON_10_ET));
    const previous = process.env.AGENT_CYCLES_ENABLED;
    process.env.AGENT_CYCLES_ENABLED = "0";

    try {
      const t = convexTest(schema, modules);
      const dmId = await seedDeskManager(t);
      await seedActiveTrader(t, dmId, { lastCycleAt: undefined });

      const result = await t.action(internal.agent.scheduler.scheduler, {});

      expect(result).toMatchObject({
        enqueued: 0,
        skipped: "autonomy_disabled",
      });
    } finally {
      if (previous === undefined) delete process.env.AGENT_CYCLES_ENABLED;
      else process.env.AGENT_CYCLES_ENABLED = previous;
    }
  });

  it("exits off-hours before querying/enqueuing trader cycles", async () => {
    vi.setSystemTime(new Date(SAT_NOON_ET));

    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId, {
      lastCycleAt: undefined,
    });

    const result = await t.action(internal.agent.scheduler.scheduler, {});

    expect(result).toMatchObject({
      enqueued: 0,
      skipped: "market_closed",
    });

    const trader = await t.run((ctx) => ctx.db.get(traderId as never));
    expect(trader?.lastCycleAt).toBeUndefined();
    expect(trader?.cycleGeneration).toBe(0);
    expect(trader?.cycleLeaseUntil).toBeUndefined();

    const rows = await t.run((ctx) =>
      ctx.db.query("agentActivityLog").collect()
    );
    expect(rows).toEqual([]);
  });

  it("enqueues eligible stale traders during market hours", async () => {
    vi.setSystemTime(new Date(MON_10_ET));

    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);
    await seedActiveTrader(t, dmId, {
      lastCycleAt: MON_10_ET - DEFAULT_CYCLE_INTERVAL_MS - 1_000,
    });
    await seedActiveTrader(t, dmId, {
      name: "Fresh Trader",
      lastCycleAt: MON_10_ET - 10_000,
    });
    await seedActiveTrader(t, dmId, {
      name: "Unfunded Trader",
      escrowBalance: 0,
      lastCycleAt: undefined,
    });

    const result = await t.action(internal.agent.scheduler.scheduler, {});

    expect(result).toEqual({ enqueued: 1, skipped: null });
  });

  it("caps per-tick cycle fanout", async () => {
    vi.setSystemTime(new Date(MON_10_ET));

    const t = convexTest(schema, modules);
    const dmId = await seedDeskManager(t);

    for (let i = 0; i < MAX_CYCLES_PER_SCHEDULER_TICK + 2; i += 1) {
      await seedActiveTrader(t, dmId, {
        name: `Stale Trader ${i}`,
        lastCycleAt: MON_10_ET - DEFAULT_CYCLE_INTERVAL_MS - 1_000,
      });
    }

    const result = await t.action(internal.agent.scheduler.scheduler, {});

    expect(result).toEqual({
      enqueued: MAX_CYCLES_PER_SCHEDULER_TICK,
      skipped: null,
    });
  });
});
