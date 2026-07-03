import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  query,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { clampLimit } from "./lib/limits";
import { resolveTraderProfileImageUrl } from "./lib/profileImage";

type TraderProfileSummary = {
  name: string;
  imageStatus: "pending" | "generating" | "ready" | "error" | null;
  profileImageUrl: string;
};

async function traderProfileSummary(
  ctx: QueryCtx,
  trader: Doc<"traders">
): Promise<TraderProfileSummary> {
  return {
    name: trader.name,
    imageStatus: trader.imageStatus ?? null,
    profileImageUrl: await resolveTraderProfileImageUrl(ctx, trader),
  };
}

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

    const query = ctx.db
      .query("agentActivityLog")
      .withIndex("byTraderAndCreatedAt", (q) => q.eq("traderId", traderId))
      .order("desc");

    return limit ? query.take(clampLimit(limit, 200)) : query.collect();
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

    const boundedLimit = limit ? clampLimit(limit, 200) : 100;

    // Each per-trader query is capped before the merge so desks with long
    // histories don't read every row on each realtime subscription refresh.
    const allActivity = (
      await Promise.all(
        traders.map((t) =>
          ctx.db
            .query("agentActivityLog")
            .withIndex("byTraderAndCreatedAt", (q) => q.eq("traderId", t._id))
            .order("desc")
            .take(boundedLimit)
        )
      )
    ).flat();

    // Sort merged results newest-first
    allActivity.sort((a, b) => b.createdAt - a.createdAt);

    // Build trader identity maps
    const traderNames: Record<string, string> = {};
    const traderProfiles: Record<string, TraderProfileSummary> = {};
    for (const trader of traders) {
      const profile = await traderProfileSummary(ctx, trader);
      traderNames[trader._id] = profile.name;
      traderProfiles[trader._id] = profile;
    }

    const limited = allActivity.slice(0, boundedLimit);
    return { activity: limited, traderNames, traderProfiles };
  },
});

/** Recent activity across all traders — public (leaderboard global feed). Newest-first. */
export const listRecentGlobal = query({
  args: {
    limit: v.optional(v.number()),
    activityTypes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { limit = 100, activityTypes }) => {
    let entries;
    if (activityTypes && activityTypes.length > 0) {
      // Query each requested type via the byActivityType index (newest-first),
      // then merge. This keeps the read set to just these types, so high-volume
      // per-cycle noise (cycle_start/end, evaluate, resolve, ...) never enters
      // the window and never invalidates this reactive subscription.
      const perType = await Promise.all(
        activityTypes.map((activityType) =>
          ctx.db
            .query("agentActivityLog")
            .withIndex("byActivityType", (q) =>
              q.eq("activityType", activityType)
            )
            .order("desc")
            .take(limit)
        )
      );
      entries = perType
        .flat()
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);
    } else {
      entries = await ctx.db
        .query("agentActivityLog")
        .withIndex("byCreatedAt")
        .order("desc")
        .take(limit);
    }

    const traderNames: Record<string, string> = {};
    const traderProfiles: Record<string, TraderProfileSummary> = {};
    for (const e of entries) {
      const tid = e.traderId;
      if (traderProfiles[tid]) continue;
      const trader = await ctx.db.get(e.traderId);
      if (trader) {
        const profile = await traderProfileSummary(ctx, trader);
        traderNames[tid] = profile.name;
        traderProfiles[tid] = profile;
      }
    }

    return { entries, traderNames, traderProfiles };
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
