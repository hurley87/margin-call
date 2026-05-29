/**
 * MCP trader lifecycle: configure, pause/resume, ownership, mandate helpers, amount parsing.
 */
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import {
  buildMandatePatch,
  assertCanActivateTrader,
} from "../../convex/traders";
import { parseAmountUsdc } from "../../convex/mcp/traders";
import { seedDeskManager, seedActiveTrader, useRealMarketHours } from "./setup";
import { MARKET_CLOSED_MESSAGE } from "../../convex/lib/tradingHours";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("parseAmountUsdc", () => {
  it("converts human USDC to atomic units", () => {
    expect(parseAmountUsdc(1)).toBe(1_000_000n);
    expect(parseAmountUsdc(0.5)).toBe(500_000n);
  });

  it("rejects non-positive amounts", () => {
    expect(() => parseAmountUsdc(0)).toThrow(/positive/i);
    expect(() => parseAmountUsdc(-1)).toThrow(/positive/i);
  });
});

describe("internal traders.updateMandateForMcp", () => {
  it("updates mandate for desk-owned trader only", async () => {
    const t = convexTest(schema, modules);
    const deskA = await seedDeskManager(t, {
      subject: "mcp:cdp-wallet:desk_a",
      walletBalance: 100,
    });
    const deskB = await seedDeskManager(t, {
      subject: "mcp:cdp-wallet:desk_b",
      walletBalance: 100,
    });
    const traderId = await seedActiveTrader(t, deskA, {
      ownerSubject: "mcp:cdp-wallet:desk_a",
      status: "paused",
      mandate: { bankroll_pct: 10 },
    });

    await t.mutation(internal.traders.updateMandateForMcp, {
      deskManagerId: deskA,
      traderId,
      mandate: { bankroll_pct: 25, keywords: ["oil"] },
    });

    const updated = await t.run(async (ctx) => ctx.db.get(traderId));
    expect(updated?.mandate).toMatchObject({
      bankroll_pct: 25,
      keywords: ["oil"],
    });

    await expect(
      t.mutation(internal.traders.updateMandateForMcp, {
        deskManagerId: deskB,
        traderId,
        mandate: { bankroll_pct: 5 },
      })
    ).rejects.toThrow(/Forbidden/i);
  });
});

describe("internal mcp.traders.configureForMcp", () => {
  it("returns summary with trader name", async () => {
    const t = convexTest(schema, modules);
    const deskId = await seedDeskManager(t, {
      subject: "mcp:cdp-wallet:cfg",
      walletBalance: 50,
    });
    const traderId = await seedActiveTrader(t, deskId, {
      ownerSubject: "mcp:cdp-wallet:cfg",
      name: "ConfigMe",
      status: "paused",
    });

    const result = await t.mutation(internal.mcp.traders.configureForMcp, {
      deskManagerId: deskId,
      traderId,
      mandate: { bankroll_pct: 15 },
      personality: "Bold",
    });

    expect(result.summary).toContain("ConfigMe");
    expect(result.traderId).toBe(String(traderId));
  });
});

describe("pause and resume (MCP)", () => {
  it("pauses an active trader", async () => {
    const t = convexTest(schema, modules);
    const deskId = await seedDeskManager(t, {
      subject: "mcp:cdp-wallet:pause_desk",
      walletBalance: 50,
    });
    const traderId = await seedActiveTrader(t, deskId, {
      ownerSubject: "mcp:cdp-wallet:pause_desk",
      status: "active",
      escrowBalance: 100,
    });

    const result = await t.mutation(internal.mcp.traders.pauseForMcp, {
      deskManagerId: deskId,
      traderId,
      now: Date.now(),
    });
    expect(result.summary).toMatch(/Paused/i);

    const trader = await t.run(async (ctx) => ctx.db.get(traderId));
    expect(trader?.status).toBe("paused");
  });

  it("resumes a funded trader when market is open", async () => {
    const t = convexTest(schema, modules);
    const deskId = await seedDeskManager(t, {
      subject: "mcp:cdp-wallet:resume_ok",
      walletBalance: 50,
    });
    const traderId = await seedActiveTrader(t, deskId, {
      ownerSubject: "mcp:cdp-wallet:resume_ok",
      status: "paused",
      escrowBalance: 50,
      walletStatus: "ready",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(traderId, { tokenId: 99 });
    });

    const result = await t.mutation(internal.mcp.traders.resumeForMcp, {
      deskManagerId: deskId,
      traderId,
      now: Date.UTC(2026, 4, 6, 15, 0, 0),
    });
    expect(result.summary).toMatch(/Resumed/i);

    const trader = await t.run(async (ctx) => ctx.db.get(traderId));
    expect(trader?.status).toBe("active");
  });

  it("rejects resume when market is closed", async () => {
    const restore = useRealMarketHours();
    try {
      const t = convexTest(schema, modules);
      const deskId = await seedDeskManager(t, {
        subject: "mcp:cdp-wallet:resume_closed",
        walletBalance: 50,
      });
      const traderId = await seedActiveTrader(t, deskId, {
        ownerSubject: "mcp:cdp-wallet:resume_closed",
        status: "paused",
        escrowBalance: 50,
        walletStatus: "ready",
      });
      await t.run(async (ctx) => {
        await ctx.db.patch(traderId, { tokenId: 1 });
      });

      // Sat 2026-05-09 12:00 ET → 16:00 UTC (see trading-hours.test.ts)
      const closedAt = Date.UTC(2026, 4, 9, 16, 0, 0);
      await expect(
        t.mutation(internal.mcp.traders.resumeForMcp, {
          deskManagerId: deskId,
          traderId,
          now: closedAt,
        })
      ).rejects.toThrow(MARKET_CLOSED_MESSAGE);
    } finally {
      restore();
    }
  });

  it("rejects resume when escrow is empty", async () => {
    const t = convexTest(schema, modules);
    const deskId = await seedDeskManager(t, {
      subject: "mcp:cdp-wallet:resume_unfunded",
      walletBalance: 50,
    });
    const traderId = await seedActiveTrader(t, deskId, {
      ownerSubject: "mcp:cdp-wallet:resume_unfunded",
      status: "paused",
      escrowBalance: 0,
      walletStatus: "ready",
    });

    await expect(
      t.mutation(internal.mcp.traders.resumeForMcp, {
        deskManagerId: deskId,
        traderId,
        now: Date.UTC(2026, 4, 6, 15, 0, 0),
      })
    ).rejects.toThrow(/Fund trader/i);
  });
});

describe("buildMandatePatch", () => {
  it("merges mandate fields onto existing trader mandate", async () => {
    const t = convexTest(schema, modules);
    const deskId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, deskId, {
      mandate: { bankroll_pct: 10, keywords: ["old"] },
    });
    const trader = await t.run(async (ctx) => ctx.db.get(traderId));
    const patch = buildMandatePatch(trader!, { bankroll_pct: 20 }, undefined);
    expect(patch.mandate).toMatchObject({
      bankroll_pct: 20,
      keywords: ["old"],
    });
  });
});

describe("assertCanActivateTrader", () => {
  it("throws for wiped out traders", async () => {
    const t = convexTest(schema, modules);
    const deskId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, deskId, {
      status: "wiped_out",
      escrowBalance: 100,
      walletStatus: "ready",
    });
    const trader = await t.run(async (ctx) => ctx.db.get(traderId));
    expect(() =>
      assertCanActivateTrader(trader!, Date.UTC(2026, 4, 6, 15, 0, 0))
    ).toThrow(/wiped out/i);
  });
});
