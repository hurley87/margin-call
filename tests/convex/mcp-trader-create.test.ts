/**
 * MCP create_trader path: shared internal `traders.createRecord`, idempotency lookup,
 * and result shaping for the MCP traders action.
 */
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import { buildCreateTraderResult } from "../../convex/mcp/traders";
import { seedDeskManager } from "./setup";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("internal traders.createRecord (MCP/shared path)", () => {
  it("inserts trader for MCP desk subject without scheduling wallet", async () => {
    const prev = process.env.MC_SKIP_WALLET_SCHEDULE;
    process.env.MC_SKIP_WALLET_SCHEDULE = "1";
    try {
      const t = convexTest(schema, modules);
      const deskId = await seedDeskManager(t, {
        subject: "mcp:cdp-wallet:testwallet12",
        walletBalance: 100,
      });

      const traderId = await t.mutation(internal.traders.createRecord, {
        deskManagerId: deskId,
        ownerSubject: "mcp:cdp-wallet:testwallet12",
        name: "MCP_Trader_1",
        mandate: { bankroll_pct: 10 },
        personality: "Gruff",
      });

      const trader = await t.run(async (ctx) => ctx.db.get(traderId));
      expect(trader).toBeTruthy();
      expect(trader!.ownerSubject).toBe("mcp:cdp-wallet:testwallet12");
      expect(trader!.deskManagerId).toEqual(deskId);
      expect(trader!.walletStatus).toBe("pending");
    } finally {
      if (prev === undefined) delete process.env.MC_SKIP_WALLET_SCHEDULE;
      else process.env.MC_SKIP_WALLET_SCHEDULE = prev;
    }
  });

  it("returns existing trader id for same owner + name (name idempotency)", async () => {
    const prev = process.env.MC_SKIP_WALLET_SCHEDULE;
    process.env.MC_SKIP_WALLET_SCHEDULE = "1";
    try {
      const t = convexTest(schema, modules);
      const deskId = await seedDeskManager(t, {
        subject: "mcp:cdp-wallet:retry_desk",
        walletBalance: 100,
      });

      const first = await t.mutation(internal.traders.createRecord, {
        deskManagerId: deskId,
        ownerSubject: "mcp:cdp-wallet:retry_desk",
        name: "RetryMe",
      });
      const second = await t.mutation(internal.traders.createRecord, {
        deskManagerId: deskId,
        ownerSubject: "mcp:cdp-wallet:retry_desk",
        name: "RetryMe",
      });
      expect(second).toEqual(first);
    } finally {
      if (prev === undefined) delete process.env.MC_SKIP_WALLET_SCHEDULE;
      else process.env.MC_SKIP_WALLET_SCHEDULE = prev;
    }
  });

  it("throws when trader name is globally taken by another desk", async () => {
    const prev = process.env.MC_SKIP_WALLET_SCHEDULE;
    process.env.MC_SKIP_WALLET_SCHEDULE = "1";
    try {
      const t = convexTest(schema, modules);
      const dm1 = await seedDeskManager(t, {
        subject: "mcp:cdp-wallet:desk_a",
        walletBalance: 100,
      });
      await t.mutation(internal.traders.createRecord, {
        deskManagerId: dm1,
        ownerSubject: "mcp:cdp-wallet:desk_a",
        name: "AlphaHandle",
      });

      const dm2 = await seedDeskManager(t, {
        subject: "mcp:cdp-wallet:desk_b",
        walletBalance: 100,
      });
      await expect(
        t.mutation(internal.traders.createRecord, {
          deskManagerId: dm2,
          ownerSubject: "mcp:cdp-wallet:desk_b",
          name: "AlphaHandle",
        })
      ).rejects.toThrow(/already taken/i);
    } finally {
      if (prev === undefined) delete process.env.MC_SKIP_WALLET_SCHEDULE;
      else process.env.MC_SKIP_WALLET_SCHEDULE = prev;
    }
  });
});

describe("buildCreateTraderResult", () => {
  it("throws when wallet is in error state", async () => {
    const t = convexTest(schema, modules);
    const deskId = await seedDeskManager(t, { walletBalance: 50 });
    const traderId = await t.run(async (ctx) =>
      ctx.db.insert("traders", {
        deskManagerId: deskId,
        ownerSubject: "mcp:cdp-wallet:x",
        name: "BadWallet",
        nameLower: "badwallet",
        status: "paused",
        walletStatus: "error",
        walletError: "Mint failed",
        escrowBalanceUsdc: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const trader = await t.run(async (ctx) => ctx.db.get(traderId));
    expect(() => buildCreateTraderResult(trader!)).toThrow(/Mint failed/);
  });

  it("builds terminal payload when wallet is ready", async () => {
    const t = convexTest(schema, modules);
    const deskId = await seedDeskManager(t, { walletBalance: 50 });
    const traderId = await t.run(async (ctx) =>
      ctx.db.insert("traders", {
        deskManagerId: deskId,
        ownerSubject: "mcp:cdp-wallet:x",
        name: "ReadyTrader",
        nameLower: "readytrader",
        status: "paused",
        walletStatus: "ready",
        tokenId: 42,
        cdpWalletAddress: "0xabc",
        cdpAccountName: "trader-sa-42",
        mintTxHash: "0xmint",
        transferTxHash: "0xtransfer",
        escrowBalanceUsdc: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const trader = await t.run(async (ctx) => ctx.db.get(traderId));
    const result = buildCreateTraderResult(trader!);
    expect(result.traderId).toBe(String(traderId));
    expect(result.tokenId).toBe(42);
    expect(result.txHashes).toEqual({ mint: "0xmint", transfer: "0xtransfer" });
    expect(result.auditTxHash).toBe("0xtransfer");
    expect(result.summary).toContain("ReadyTrader");
  });
});

describe("mcp.requests.findRecentByKey", () => {
  it("returns the newest canonical audit row within the window for desk + tool + key", async () => {
    const t = convexTest(schema, modules);
    const deskId = await seedDeskManager(t, { walletBalance: 50 });
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("mcpRequests", {
        deskManagerId: deskId,
        tool: "create_trader",
        idempotencyKey: "idem-test-1",
        result: { traderId: "older" },
        durationMs: 5,
        createdAt: now - 9000,
      });
      await ctx.db.insert("mcpRequests", {
        deskManagerId: deskId,
        tool: "create_trader",
        idempotencyKey: "idem-test-1",
        result: { traderId: "newer" },
        durationMs: 8,
        createdAt: now - 2000,
      });
      // Replay audit row (no idempotencyKey) must not win the cache lookup.
      await ctx.db.insert("mcpRequests", {
        deskManagerId: deskId,
        tool: "create_trader",
        result: { traderId: "replay", cached: true },
        durationMs: 1,
        createdAt: now - 1000,
      });
    });

    const found = await t.query(internal.mcp.requests.findRecentByKey, {
      deskManagerId: deskId,
      idempotencyKey: "idem-test-1",
      tool: "create_trader",
      minCreatedAt: now - 24 * 60 * 60 * 1000,
    });

    expect(found).toBeTruthy();
    expect(found!.result).toEqual({ traderId: "newer" });
  });

  it("returns cached error rows for idempotent failure replay", async () => {
    const t = convexTest(schema, modules);
    const deskId = await seedDeskManager(t, { walletBalance: 50 });
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("mcpRequests", {
        deskManagerId: deskId,
        tool: "create_trader",
        idempotencyKey: "fail-key",
        error: "Wallet provisioning failed",
        durationMs: 12000,
        createdAt: now - 5000,
      });
    });

    const found = await t.query(internal.mcp.requests.findRecentByKey, {
      deskManagerId: deskId,
      idempotencyKey: "fail-key",
      tool: "create_trader",
      minCreatedAt: now - 24 * 60 * 60 * 1000,
    });

    expect(found?.error).toBe("Wallet provisioning failed");
  });

  it("returns null when newest row predates minCreatedAt", async () => {
    const t = convexTest(schema, modules);
    const deskId = await seedDeskManager(t, { walletBalance: 50 });
    const old = Date.now() - 30 * 24 * 60 * 60 * 1000;
    await t.run(async (ctx) => {
      await ctx.db.insert("mcpRequests", {
        deskManagerId: deskId,
        tool: "create_trader",
        idempotencyKey: "stale-key",
        result: { x: 1 },
        durationMs: 5,
        createdAt: old,
      });
    });

    const found = await t.query(internal.mcp.requests.findRecentByKey, {
      deskManagerId: deskId,
      idempotencyKey: "stale-key",
      tool: "create_trader",
      minCreatedAt: Date.now() - 24 * 60 * 60 * 1000,
    });
    expect(found).toBeNull();
  });
});
