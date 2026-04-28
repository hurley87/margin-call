import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

// ── Public queries ─────────────────────────────────────────────────────────

/**
 * List activity log entries for a trader.
 * Auth-checked: only the owning desk manager may read.
 * Returns newest-first.
 */
export const listByTrader = query({
  args: {
    traderId: v.id("traders"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { traderId, limit }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const trader = await ctx.db.get(traderId);
    if (!trader || trader.ownerSubject !== identity.subject) return [];

    const results = await ctx.db
      .query("agentActivityLog")
      .withIndex("byTraderAndCreatedAt", (q) => q.eq("traderId", traderId))
      .order("desc")
      .collect();

    return limit ? results.slice(0, limit) : results;
  },
});

/**
 * List activity log entries for all traders owned by the authenticated desk manager.
 * Returns newest-first, up to `limit` entries.
 */
export const listForDesk = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const dm = await ctx.db
      .query("deskManagers")
      .withIndex("bySubject", (q) => q.eq("subject", identity.subject))
      .unique();
    if (!dm) return [];

    // Get all traders owned by this desk manager
    const traders = await ctx.db
      .query("traders")
      .withIndex("byDeskManager", (q) => q.eq("deskManagerId", dm._id))
      .collect();

    if (traders.length === 0) return [];

    const traderIds = new Set(traders.map((t) => t._id));

    // Collect activity for all owned traders
    const allActivity = (
      await Promise.all(
        traders.map((t) =>
          ctx.db
            .query("agentActivityLog")
            .withIndex("byTraderAndCreatedAt", (q) => q.eq("traderId", t._id))
            .order("desc")
            .collect()
        )
      )
    ).flat();

    // Sort merged results newest-first
    allActivity.sort((a, b) => b.createdAt - a.createdAt);

    // Build traderNames map
    const traderNames: Record<string, string> = {};
    for (const t of traders) {
      if (traderIds.has(t._id)) traderNames[t._id] = t.name;
    }

    const limited = limit ? allActivity.slice(0, limit) : allActivity;
    return { activity: limited, traderNames };
  },
});

/**
 * Public: global activity feed — all activity across all traders.
 * Auth-checked (any authenticated user may view the global feed).
 * Returns newest-first, up to `limit` entries, with a traderNames map.
 */
export const listGlobal = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 200 }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { activity: [], traderNames: {} };

    const allActivity = await ctx.db
      .query("agentActivityLog")
      .order("desc")
      .take(Math.min(limit, 500));

    // Build traderNames map from referenced traders
    const traderIdSet = new Set(allActivity.map((a) => a.traderId));
    const traderNames: Record<string, string> = {};
    await Promise.all(
      Array.from(traderIdSet).map(async (tid) => {
        const t = await ctx.db.get(tid);
        if (t) traderNames[t._id] = t.name;
      })
    );

    return { activity: allActivity, traderNames };
  },
});

// ── Internal queries ───────────────────────────────────────────────────────

/** Internal: check if an activity entry with this dedupe key already exists. */
export const findByDedupeKey = internalQuery({
  args: { dedupeKey: v.string() },
  handler: async (ctx, { dedupeKey }) =>
    ctx.db
      .query("agentActivityLog")
      .withIndex("byDedupeKey", (q) => q.eq("dedupeKey", dedupeKey))
      .unique(),
});

// ── Internal mutations ─────────────────────────────────────────────────────

/**
 * Internal: append an activity log entry.
 *
 * Dedupe key formation (per PRD):
 *   - If `dedupeKey` is provided explicitly, use it.
 *   - Otherwise, form it as `{traderId}:{dealId ?? ""}:{activityType}:{correlationId ?? ""}`.
 *
 * If an entry with the same dedupeKey already exists, the write is a no-op (idempotent).
 * If no dedupeKey is derivable (no traderId/activityType), the entry is always appended.
 */
export const append = internalMutation({
  args: {
    traderId: v.id("traders"),
    activityType: v.string(),
    message: v.string(),
    dealId: v.optional(v.id("deals")),
    metadata: v.optional(v.any()),
    /** Explicit stable event id (e.g. UUID from caller). If provided, used directly as dedupeKey. */
    eventId: v.optional(v.string()),
    /** Correlation id for grouping retried events (e.g. cycle run id). */
    correlationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Compute dedupe key
    const dedupeKey = args.eventId
      ? args.eventId
      : `${args.traderId}:${args.dealId ?? ""}:${args.activityType}:${args.correlationId ?? ""}`;

    // Check for existing entry with the same dedupe key
    const existing = await ctx.db
      .query("agentActivityLog")
      .withIndex("byDedupeKey", (q) => q.eq("dedupeKey", dedupeKey))
      .unique();
    if (existing) return existing._id;

    return ctx.db.insert("agentActivityLog", {
      traderId: args.traderId,
      activityType: args.activityType,
      message: args.message,
      dealId: args.dealId,
      metadata: args.metadata,
      dedupeKey,
      createdAt: Date.now(),
    });
  },
});
