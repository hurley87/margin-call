import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

/**
 * Pending high-stakes approvals for the desk (MCP `get_pending_approvals`).
 * Includes remaining TTL in seconds for Claude to reason about urgency.
 * Only non-expired pending rows.
 */
export const getPending = internalQuery({
  args: {
    deskManagerId: v.id("deskManagers"),
    now: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { deskManagerId, now, limit = 20 }) => {
    const bounded = Math.min(Math.max(1, limit), 50);

    const approvals = await ctx.db
      .query("dealApprovals")
      .withIndex("byDeskManagerAndStatus", (q) =>
        q.eq("deskManagerId", deskManagerId).eq("status", "pending")
      )
      .filter((q) => q.gt(q.field("expiresAt"), now))
      .order("desc")
      .take(bounded);

    const items = await Promise.all(
      approvals.map(async (a) => {
        const [trader, deal] = await Promise.all([
          ctx.db.get(a.traderId),
          ctx.db.get(a.dealId),
        ]);
        const ttlSec = Math.max(0, Math.floor((a.expiresAt - now) / 1000));
        return {
          approvalId: a._id,
          traderId: a.traderId,
          traderName: trader?.name ?? "Unknown",
          dealId: a.dealId,
          dealPrompt: deal?.prompt ?? "",
          potUsdc: a.potUsdc,
          entryCostUsdc: a.entryCostUsdc,
          expiresAt: a.expiresAt,
          remainingTtlSeconds: ttlSec,
          createdAt: a.createdAt,
        };
      })
    );

    const oldestAgeSeconds =
      items.length > 0
        ? Math.floor(
            (now - Math.min(...approvals.map((a) => a.createdAt))) / 1000
          )
        : null;

    return {
      approvals: items,
      count: items.length,
      oldestAgeSeconds,
    };
  },
});
