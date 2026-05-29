import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { assertTraderOwnedByDesk, buildMandatePatch } from "../traders";
import { resolveReadyProfileImageUrl } from "../lib/profileImage";

export type McpCreateTraderResult = {
  traderId: string;
  tokenId: number;
  walletAddress: string | undefined;
  txHashes: { mint: string | null; transfer: string | null };
  summary: string;
  auditTxHash: string | undefined;
};

export type McpTraderWriteResult = {
  traderId: string;
  summary: string;
  txHash?: string;
};

const USDC_DECIMALS = 1_000_000;
const MAX_AMOUNT_USDC = 1_000_000;

/** Terminal + audit payload for a successfully provisioned MCP trader. */
export function buildCreateTraderResult(
  trader: Doc<"traders">
): McpCreateTraderResult {
  if (trader.walletStatus === "error") {
    throw new Error(trader.walletError ?? "Wallet provisioning failed");
  }
  if (trader.walletStatus !== "ready" || trader.tokenId == null) {
    throw new Error(
      `Wallet not ready after provisioning (status=${trader.walletStatus})`
    );
  }

  const summary = `Hired trader "${trader.name}" (ERC-8004 token #${trader.tokenId}). Trader identity wallet ${trader.cdpWalletAddress ?? "?"}. Fund escrow via fund_trader (Base MCP approval).`;

  return {
    traderId: String(trader._id),
    tokenId: trader.tokenId,
    walletAddress: trader.cdpWalletAddress,
    txHashes: {
      mint: trader.mintTxHash ?? null,
      transfer: trader.transferTxHash ?? null,
    },
    summary,
    auditTxHash: trader.transferTxHash ?? trader.mintTxHash ?? undefined,
  };
}

/** Validates human USDC amount and returns atomic units. */
export function parseAmountUsdc(amountUsdc: number): bigint {
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    throw new Error("amountUsdc must be a positive number");
  }
  if (amountUsdc > MAX_AMOUNT_USDC) {
    throw new Error(`amountUsdc must be at most ${MAX_AMOUNT_USDC}`);
  }
  const atomic = Math.round(amountUsdc * USDC_DECIMALS);
  if (atomic <= 0) {
    throw new Error("amountUsdc is too small after conversion");
  }
  return BigInt(atomic);
}

/**
 * MCP `create_trader`: desk gate → shared createRecord → blocking wallet pipeline.
 * Called from the /mcp/traders/create HTTP action (after idempotency shell).
 */
export const createForMcp = internalAction({
  args: {
    deskManagerId: v.id("deskManagers"),
    name: v.string(),
    mandate: v.optional(v.any()),
    personality: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<McpCreateTraderResult> => {
    const dm: Doc<"deskManagers"> | null = await ctx.runQuery(
      internal.deskManagers.getByIdInternal,
      { id: args.deskManagerId }
    );
    if (!dm?.subject) {
      throw new Error("Desk not found");
    }
    if (!dm.walletAddress) {
      throw new Error(
        "Bind your Base Account with set_desk_wallet before hiring a trader"
      );
    }
    if ((dm.walletBalanceUsdc ?? 0) <= 0) {
      throw new Error(
        "Fund your Base Account and sync_wallet before hiring a trader"
      );
    }

    const traderId: Id<"traders"> = await ctx.runMutation(
      internal.traders.createRecord,
      {
        deskManagerId: args.deskManagerId,
        ownerSubject: dm.subject,
        name: args.name,
        mandate: args.mandate,
        personality: args.personality,
      }
    );

    await ctx.runAction(internal.wallet.createForTrader, { traderId });

    const trader: Doc<"traders"> | null = await ctx.runQuery(
      internal.traders.loadInternal,
      { traderId }
    );
    if (!trader) {
      throw new Error("Trader row missing after provisioning");
    }

    return buildCreateTraderResult(trader);
  },
});

/** MCP `configure_trader`: update mandate + personality for owned trader. */
export const configureForMcp = internalMutation({
  args: {
    deskManagerId: v.id("deskManagers"),
    traderId: v.id("traders"),
    mandate: v.any(),
    personality: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args): Promise<McpTraderWriteResult> => {
    const trader = await ctx.db.get(args.traderId);
    assertTraderOwnedByDesk(trader, args.deskManagerId);
    const patch = buildMandatePatch(trader, args.mandate, args.personality);
    await ctx.db.patch(args.traderId, patch);
    const escrow = trader.escrowBalanceUsdc ?? 0;
    return {
      traderId: String(args.traderId),
      summary: `Updated trader "${trader.name}" mandate and personality (status ${trader.status}, escrow ${escrow.toFixed(2)} USDC). No on-chain change; takes effect on the next cycle.`,
    };
  },
});

/** MCP `pause_trader`: pause an owned trader. */
export const pauseForMcp = internalMutation({
  args: {
    deskManagerId: v.id("deskManagers"),
    traderId: v.id("traders"),
    now: v.number(),
  },
  handler: async (ctx, args): Promise<McpTraderWriteResult> => {
    const trader = await ctx.db.get(args.traderId);
    assertTraderOwnedByDesk(trader, args.deskManagerId);
    await ctx.db.patch(args.traderId, {
      status: "paused",
      updatedAt: args.now,
    });
    const escrow = trader.escrowBalanceUsdc ?? 0;
    return {
      traderId: String(args.traderId),
      summary: `Paused trader "${trader.name}" — autonomous cycle will skip them. Escrow balance retained at ${escrow.toFixed(2)} USDC; resume_trader reactivates with no on-chain change.`,
    };
  },
});

/** MCP `resume_trader`: activate owned funded trader when market is open. */
export const resumeForMcp = internalMutation({
  args: {
    deskManagerId: v.id("deskManagers"),
    traderId: v.id("traders"),
    now: v.number(),
  },
  handler: async (ctx, args): Promise<McpTraderWriteResult> => {
    const { traderName } = await ctx.runMutation(
      internal.traders.setStatusForMcp,
      {
        deskManagerId: args.deskManagerId,
        traderId: args.traderId,
        status: "active",
        now: args.now,
      }
    );
    const trader = await ctx.db.get(args.traderId);
    const escrow = trader?.escrowBalanceUsdc ?? 0;
    return {
      traderId: String(args.traderId),
      summary: `Resumed trader "${traderName}" — autonomous deal cycle will pick entries while the market is open (escrow ${escrow.toFixed(2)} USDC available).`,
    };
  },
});

/**
 * Read-only list of a desk's traders for MCP `list_traders`.
 * Returns compact terminal-usable fields + recent 30d P&L per trader + latest activity snippet.
 * `since` passed in so this query never calls Date.now().
 */
export const list = internalQuery({
  args: {
    deskManagerId: v.id("deskManagers"),
    since: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { deskManagerId, since, limit = 20 }) => {
    const bounded = Math.min(Math.max(1, limit), 50);

    const traders = await ctx.db
      .query("traders")
      .withIndex("byDeskManager", (q) => q.eq("deskManagerId", deskManagerId))
      .order("desc")
      .take(bounded);

    const results = await Promise.all(
      traders.map(async (t) => {
        const recentOutcomes = await ctx.db
          .query("dealOutcomes")
          .withIndex("byTrader", (q) => q.eq("traderId", t._id))
          .order("desc")
          .take(100);
        let recentPnlUsdc = 0;
        for (const o of recentOutcomes) {
          if (o.createdAt >= since && typeof o.traderPnlUsdc === "number") {
            recentPnlUsdc += o.traderPnlUsdc;
          }
        }

        const latestAct = await ctx.db
          .query("agentActivityLog")
          .withIndex("byTraderAndCreatedAt", (q) => q.eq("traderId", t._id))
          .order("desc")
          .take(1);
        const lastActivity =
          latestAct[0] != null
            ? {
                at: latestAct[0].createdAt,
                type: latestAct[0].activityType,
                message: latestAct[0].message,
              }
            : null;

        const profileImageUrl = await resolveReadyProfileImageUrl(ctx, t);

        return {
          traderId: t._id,
          name: t.name,
          status: t.status,
          tokenId: t.tokenId ?? null,
          escrowBalanceUsdc: t.escrowBalanceUsdc ?? 0,
          mandate: t.mandate ?? null,
          personality: t.personality ?? null,
          walletStatus: t.walletStatus,
          cdpWalletAddress: t.cdpWalletAddress ?? null,
          recentPnlUsdc,
          lastCycleAt: t.lastCycleAt ?? null,
          lastActivity,
          createdAt: t.createdAt,
          profileImageUrl,
          imageStatus: t.imageStatus ?? null,
        };
      })
    );

    return {
      traders: results,
      count: results.length,
    };
  },
});
