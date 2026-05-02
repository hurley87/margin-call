import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

// ── Public queries (auth-checked) ──────────────────────────────────────────

/** List all open deals — visible to any authenticated user. */
export const listOpen = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return ctx.db
      .query("deals")
      .withIndex("byStatus", (q) => q.eq("status", "open"))
      .order("desc")
      .collect();
  },
});

/** List all deals (any status) — visible to any authenticated user. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return ctx.db.query("deals").order("desc").collect();
  },
});

/** Get a deal by id — visible to any authenticated user. */
export const getById = query({
  args: { dealId: v.id("deals") },
  handler: async (ctx, { dealId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return ctx.db.get(dealId);
  },
});

/** List deals created by the authenticated desk manager. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const dm = await ctx.db
      .query("deskManagers")
      .withIndex("bySubject", (q) => q.eq("subject", identity.subject))
      .unique();
    if (!dm) return [];

    return ctx.db
      .query("deals")
      .withIndex("byCreator", (q) => q.eq("creatorDeskManagerId", dm._id))
      .order("desc")
      .collect();
  },
});

// ── Internal queries (used by cycle actions) ───────────────────────────────

/** Internal: load a deal without auth (for agent cycle). */
export const loadInternal = internalQuery({
  args: { dealId: v.id("deals") },
  handler: async (ctx, { dealId }) => ctx.db.get(dealId),
});

/** Internal: list open deals for deal selection. */
export const listOpenInternal = internalQuery({
  args: {},
  handler: async (ctx) =>
    ctx.db
      .query("deals")
      .withIndex("byStatus", (q) => q.eq("status", "open"))
      .collect(),
});

// ── Internal mutations (called by cycle, x402 boundary, etc.) ─────────────

/**
 * Internal: record a deal entry event from the agent cycle.
 * The cycle calls this after x402 payment is verified in Next.js.
 * Idempotent via idempotencyKey (e.g. x402 settlement id / request id).
 */
export const recordDealEntry = internalMutation({
  args: {
    traderId: v.id("traders"),
    creatorDeskManagerId: v.optional(v.id("deskManagers")),
    creatorAddress: v.optional(v.string()),
    creatorType: v.union(v.literal("desk_manager"), v.literal("agent")),
    prompt: v.string(),
    potUsdc: v.number(),
    entryCostUsdc: v.number(),
    maxExtractionPercentage: v.optional(v.number()),
    feeUsdc: v.optional(v.number()),
    onChainDealId: v.optional(v.number()),
    onChainTxHash: v.optional(v.string()),
    sourceHeadline: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Idempotency: if a deal with this onChainDealId already exists, return it
    if (args.onChainDealId !== undefined) {
      const existing = await ctx.db
        .query("deals")
        .withIndex("byOnChainDealId", (q) =>
          q.eq("onChainDealId", args.onChainDealId)
        )
        .unique();
      if (existing) return existing._id;
    }

    const now = Date.now();
    const { idempotencyKey: _key, traderId: _traderId, ...dealData } = args;
    return ctx.db.insert("deals", {
      ...dealData,
      status: "open",
      entryCount: 1,
      wipeoutCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Internal: update deal status (e.g. close/deplete after outcome). */
export const updateStatus = internalMutation({
  args: {
    dealId: v.id("deals"),
    status: v.union(
      v.literal("open"),
      v.literal("closed"),
      v.literal("depleted")
    ),
  },
  handler: async (ctx, { dealId, status }) => {
    const deal = await ctx.db.get(dealId);
    if (!deal) return;
    await ctx.db.patch(dealId, { status, updatedAt: Date.now() });
  },
});

/** Internal: increment entry count on a deal. */
export const incrementEntryCount = internalMutation({
  args: { dealId: v.id("deals") },
  handler: async (ctx, { dealId }) => {
    const deal = await ctx.db.get(dealId);
    if (!deal) return;
    await ctx.db.patch(dealId, {
      entryCount: (deal.entryCount ?? 0) + 1,
      updatedAt: Date.now(),
    });
  },
});
