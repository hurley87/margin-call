import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

/**
 * Read-only list of open (or recent) deals for MCP `list_deals`.
 * Includes own-desk eligibility flag so Claude knows which deals his traders may enter.
 */
export const list = internalQuery({
  args: {
    deskManagerId: v.id("deskManagers"),
    limit: v.optional(v.number()),
    includeClosed: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { deskManagerId, limit = 30, includeClosed = false }
  ) => {
    const bounded = Math.min(Math.max(1, limit), 100);

    let q = ctx.db
      .query("deals")
      .withIndex("byStatus", (qq) => qq.eq("status", "open"))
      .order("desc");

    if (includeClosed) {
      q = ctx.db.query("deals").order("desc");
    }

    const deals = await q.take(bounded);

    const items = deals.map((d) => {
      const isOwnDesk = d.creatorDeskManagerId === deskManagerId;
      return {
        dealId: d._id,
        prompt: d.prompt,
        sourceHeadline: d.sourceHeadline ?? null,
        potUsdc: d.potUsdc,
        entryCostUsdc: d.entryCostUsdc,
        status: d.status,
        creatorType: d.creatorType,
        creatorDeskManagerId: d.creatorDeskManagerId ?? null,
        entryCount: d.entryCount ?? 0,
        eligibleForMe: !isOwnDesk,
        createdAt: d.createdAt,
      };
    });

    return {
      deals: items,
      count: items.length,
    };
  },
});
