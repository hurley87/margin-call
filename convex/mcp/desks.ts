import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

/**
 * Read-only desk snapshot for MCP get_desk. Called from the mcp/* HTTP action
 * after service-token validation; `since` is supplied by the caller so this
 * query handler never invokes Date.now() (Convex guideline).
 */
export const getState = internalQuery({
  args: {
    deskManagerId: v.id("deskManagers"),
    since: v.number(),
  },
  handler: async (ctx, { deskManagerId, since }) => {
    const desk = await ctx.db.get(deskManagerId);
    if (!desk) {
      throw new Error("Desk not found");
    }

    const traders = await ctx.db
      .query("traders")
      .withIndex("byDeskManager", (q) => q.eq("deskManagerId", deskManagerId))
      .take(50);

    const openDeals = await ctx.db
      .query("deals")
      .withIndex("byCreatorAndStatus", (q) =>
        q.eq("creatorDeskManagerId", deskManagerId).eq("status", "open")
      )
      .take(50);

    // OUTCOME_LIMIT is generous enough to cover a heavy 30-day window per
    // trader; if a trader exceeds it we silently undercount, acceptable for a
    // snapshot. Drop to a proper byTraderAndCreatedAt index when this becomes
    // hot.
    const OUTCOME_LIMIT = 200;
    const outcomesByTrader = await Promise.all(
      traders.map((t) =>
        ctx.db
          .query("dealOutcomes")
          .withIndex("byTrader", (q) => q.eq("traderId", t._id))
          .order("desc")
          .take(OUTCOME_LIMIT)
      )
    );

    let recentPnlUsdc = 0;
    for (const outs of outcomesByTrader) {
      for (const o of outs) {
        if (o.createdAt >= since && typeof o.traderPnlUsdc === "number") {
          recentPnlUsdc += o.traderPnlUsdc;
        }
      }
    }

    const walletAddress = desk.walletAddress ?? null;
    const balance = desk.walletBalanceUsdc ?? 0;
    const traderCount = traders.length;
    const openDealCount = openDeals.length;

    let summary: string;
    if (!walletAddress) {
      summary =
        "Desk wallet not yet provisioned. Sign in to the Margin Call web app to finish setup.";
    } else if (balance <= 0) {
      summary = `Send USDC to ${walletAddress} (Base Sepolia) to fund this desk.`;
    } else {
      summary = `Balance: ${balance.toFixed(2)} USDC • ${traderCount} trader(s) • ${openDealCount} open deal(s) • Recent P&L: ${recentPnlUsdc.toFixed(2)} USDC`;
    }

    return {
      deskId: deskManagerId,
      walletAddress,
      walletBalanceUsdc: balance,
      walletBalanceSyncedAt: desk.walletBalanceSyncedAt,
      traderCount,
      openDealCount,
      recentPnlUsdc,
      summary,
    };
  },
});
