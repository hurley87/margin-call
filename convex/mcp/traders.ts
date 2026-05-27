import { internalAction, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";

export type McpCreateTraderResult = {
  traderId: string;
  tokenId: number;
  walletAddress: string | undefined;
  txHashes: { mint: string | null; transfer: string | null };
  summary: string;
  auditTxHash: string | undefined;
};

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

  const summary = `Hired trader "${trader.name}" (ERC-8004 token #${trader.tokenId}). CDP smart-account wallet ${trader.cdpWalletAddress ?? "?"} (${trader.cdpAccountName ?? ""}).`;

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
    if ((dm.walletBalanceUsdc ?? 0) <= 0) {
      throw new Error("Fund your wallet before hiring a trader");
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
        };
      })
    );

    return {
      traders: results,
      count: results.length,
    };
  },
});
