import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { isOwnDeskCreatedDeal } from "./lib/dealEntryEligibility";
import { clampLimit } from "./lib/limits";
import { assertTradingHoursWithCloseGrace } from "./lib/tradingHours";

/** Lightweight enrichment for public deal reads: join creator desk subject to expose is_agent_desk flag (no DB write, mirrors leaderboard pattern). */
async function enrichWithCreatorAgentStatus(
  ctx: QueryCtx,
  deals: Doc<"deals">[]
): Promise<Array<Doc<"deals"> & { creatorIsAgentDesk?: boolean }>> {
  if (deals.length === 0) {
    return [] as Array<Doc<"deals"> & { creatorIsAgentDesk?: boolean }>;
  }
  const deskIdSet = new Set<string>();
  for (const d of deals) {
    if (d.creatorType === "desk_manager" && d.creatorDeskManagerId) {
      deskIdSet.add(String(d.creatorDeskManagerId));
    }
  }
  const deskIds = Array.from(deskIdSet);
  const isAgentMap = new Map<string, boolean>();
  await Promise.all(
    deskIds.map(async (id) => {
      const dm = await ctx.db.get(id as Id<"deskManagers">);
      const isAgent =
        typeof dm?.subject === "string" &&
        dm.subject.startsWith("mcp:cdp-wallet:");
      isAgentMap.set(id, isAgent);
    })
  );
  return deals.map((d) => {
    let creatorIsAgentDesk: boolean | undefined;
    if (d.creatorType === "desk_manager" && d.creatorDeskManagerId) {
      creatorIsAgentDesk =
        isAgentMap.get(String(d.creatorDeskManagerId)) ?? false;
    }
    return { ...d, creatorIsAgentDesk };
  });
}

// ── Public queries (auth-checked) ──────────────────────────────────────────

/** List all open deals — visible to any authenticated user. */
export const listOpen = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const raw = await ctx.db
      .query("deals")
      .withIndex("byStatus", (q) => q.eq("status", "open"))
      .order("desc")
      .collect();
    return enrichWithCreatorAgentStatus(ctx, raw);
  },
});

/** List all deals (any status) — visible to any authenticated user. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const raw = await ctx.db.query("deals").order("desc").collect();
    return enrichWithCreatorAgentStatus(ctx, raw);
  },
});

/** Recent created deals for authenticated global game-floor alerts. */
export const listRecentCreatedForToasts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 25 }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const boundedLimit = clampLimit(limit, 50);
    const raw = await ctx.db
      .query("deals")
      .withIndex("byCreatedAt")
      .order("desc")
      .take(boundedLimit);
    return enrichWithCreatorAgentStatus(ctx, raw);
  },
});

/** Get a deal by id — visible to any authenticated user. */
export const getById = query({
  args: { dealId: v.id("deals") },
  handler: async (ctx, { dealId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const deal = await ctx.db.get(dealId);
    if (!deal) return null;
    const enriched = await enrichWithCreatorAgentStatus(ctx, [deal]);
    return enriched[0];
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

    const raw = await ctx.db
      .query("deals")
      .withIndex("byCreator", (q) => q.eq("creatorDeskManagerId", dm._id))
      .order("desc")
      .collect();
    return enrichWithCreatorAgentStatus(ctx, raw);
  },
});

// ── Public mutations (auth-checked) ────────────────────────────────────────

/**
 * Public: record a user-created on-chain deal in Convex.
 * Idempotent on `onChainDealId` — repeat calls return the existing deal id.
 */
export const recordOnChainCreation = mutation({
  args: {
    onChainDealId: v.number(),
    onChainTxHash: v.string(),
    prompt: v.string(),
    potUsdc: v.number(),
    entryCostUsdc: v.number(),
    sourceHeadline: v.optional(v.string()),
    /**
     * Optional Wire Deal Seed this deal was created from. When provided, a
     * wireDealSeedLinks row is inserted in the same mutation. Multiple deals
     * may link to the same seed — seeds are never marked taken.
     */
    wireDealSeedId: v.optional(v.id("wireDealSeeds")),
  },
  handler: async (ctx, args) => {
    // Trading-hours guard with +60s close grace (see trading-hours spec §5.1).
    // Rejects hard pre-open; on-chain settlements that surface just past
    // 16:00 ET within the grace window are still accepted.
    assertTradingHoursWithCloseGrace();

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const dm = await ctx.db
      .query("deskManagers")
      .withIndex("bySubject", (q) => q.eq("subject", identity.subject))
      .unique();
    if (!dm) throw new Error("Desk manager not found");

    const existing = await ctx.db
      .query("deals")
      .withIndex("byOnChainDealId", (q) =>
        q.eq("onChainDealId", args.onChainDealId)
      )
      .unique();
    if (existing) return existing._id;

    if ((dm.walletBalanceUsdc ?? 0) <= 0) {
      throw new Error("Fund your wallet before creating a deal");
    }

    const now = Date.now();
    const dealId = await ctx.db.insert("deals", {
      creatorDeskManagerId: dm._id,
      creatorAddress: dm.walletAddress,
      creatorType: "desk_manager",
      prompt: args.prompt,
      potUsdc: args.potUsdc,
      entryCostUsdc: args.entryCostUsdc,
      status: "open",
      onChainDealId: args.onChainDealId,
      onChainTxHash: args.onChainTxHash,
      sourceHeadline: args.sourceHeadline,
      entryCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    if (args.wireDealSeedId) {
      await ctx.db.insert("wireDealSeedLinks", {
        seedId: args.wireDealSeedId,
        dealId,
        deskManagerId: dm._id,
        createdAt: now,
      });
    }

    return dealId;
  },
});

/** Public: set status of a user-created deal by its on-chain id. */
export const setStatusByOnChainId = mutation({
  args: {
    onChainDealId: v.number(),
    status: v.union(
      v.literal("open"),
      v.literal("closed"),
      v.literal("depleted")
    ),
  },
  handler: async (ctx, { onChainDealId, status }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const deal = await ctx.db
      .query("deals")
      .withIndex("byOnChainDealId", (q) => q.eq("onChainDealId", onChainDealId))
      .unique();
    if (!deal) throw new Error("Deal not found");

    const dm = await ctx.db
      .query("deskManagers")
      .withIndex("bySubject", (q) => q.eq("subject", identity.subject))
      .unique();
    if (!dm || deal.creatorDeskManagerId !== dm._id) {
      throw new Error("Forbidden");
    }

    await ctx.db.patch(deal._id, { status, updatedAt: Date.now() });
    return { ok: true as const };
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
    void _key;
    void _traderId;
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

// ── Internal query: look up a verified entry by paymentId ─────────────────

/**
 * Internal: find a verified deal entry by payment id.
 * Used by the route to check idempotency before inserting.
 */
export const findEntryByPaymentId = internalQuery({
  args: { paymentId: v.string() },
  handler: async (ctx, { paymentId }) =>
    ctx.db
      .query("dealEntries")
      .withIndex("byPaymentId", (q) => q.eq("paymentId", paymentId))
      .unique(),
});

/**
 * Internal: most recent verified entry for (traderId, dealId).
 * Used by agent-cycle `/api/deal/enter` for idempotency without Supabase.
 */
export const findVerifiedEntryByTraderAndDeal = internalQuery({
  args: { traderId: v.string(), dealId: v.id("deals") },
  handler: async (ctx, { traderId, dealId }) => {
    const rows = await ctx.db
      .query("dealEntries")
      .withIndex("byTraderAndDeal", (q) =>
        q.eq("traderId", traderId).eq("dealId", dealId)
      )
      .order("desc")
      .take(1);
    return rows[0] ?? null;
  },
});

/**
 * Internal: claim an entry slot before on-chain enterDeal.
 * Idempotent on (traderId, dealId). Returns existing row if already claimed.
 */
export const beginEntryRecording = internalMutation({
  args: {
    dealId: v.id("deals"),
    traderId: v.string(),
    entryCostUsdc: v.number(),
    onChainDealId: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertTradingHoursWithCloseGrace();

    const existing = await ctx.db
      .query("dealEntries")
      .withIndex("byTraderAndDeal", (q) =>
        q.eq("traderId", args.traderId).eq("dealId", args.dealId)
      )
      .unique();
    if (existing) {
      return {
        entryId: existing._id,
        paymentId: existing.paymentId,
        alreadyClaimed: true,
      };
    }

    const dealDoc = await ctx.db.get(args.dealId);
    if (!dealDoc) throw new Error("Deal not found");
    if (dealDoc.status !== "open") throw new Error("Deal is not open");

    const traderDoc = await ctx.db.get(args.traderId as Id<"traders">);
    if (!traderDoc) throw new Error("Trader not found");
    if (traderDoc.status !== "active") {
      throw new Error("Trader is not active");
    }
    if (
      isOwnDeskCreatedDeal(
        { creatorDeskManagerId: dealDoc.creatorDeskManagerId },
        String(traderDoc.deskManagerId)
      )
    ) {
      throw new Error("Trader cannot enter deals created by its own desk.");
    }

    const paymentId = `pending:${args.traderId}:${args.dealId}`;
    const entryId = await ctx.db.insert("dealEntries", {
      paymentId,
      dealId: args.dealId,
      traderId: args.traderId,
      entryCostUsdc: args.entryCostUsdc,
      onChainDealId: args.onChainDealId,
      createdAt: Date.now(),
    });

    return { entryId, paymentId, alreadyClaimed: false };
  },
});

/**
 * Internal: record a verified x402 deal entry.
 *
 * This is the **single writer path** for marking a deal entry as paid/verified.
 * It must only be called from Next.js API routes after payment has been
 * verified at the HTTP boundary — never from client-side code.
 *
 * Idempotency: if a `dealEntries` row already exists for `paymentId`, this
 * mutation returns the existing id without creating a duplicate. Duplicate
 * settlement callbacks are safe to replay.
 *
 * Security: no public `mutation` export accepts `verified`, `paid`,
 * `settled`, or `paymentId` flags from untrusted client input.
 */
export const recordVerifiedEntry = internalMutation({
  args: {
    // Idempotency key — x402 settlement id, payment id, or request id.
    paymentId: v.string(),
    dealId: v.id("deals"),
    // String to support both Convex trader ids and legacy Supabase ids.
    traderId: v.string(),
    entryCostUsdc: v.number(),
    // Settlement / on-chain metadata (all optional)
    enterTxHash: v.optional(v.string()),
    resolveTxHash: v.optional(v.string()),
    onChainDealId: v.optional(v.number()),
    // Outcome snapshot captured at entry time
    traderPnlUsdc: v.optional(v.number()),
    rakeUsdc: v.optional(v.number()),
    traderWipedOut: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Defensive trading-hours guard with +60s close grace (spec §5.1).
    // The HTTP route is the primary gate; this guards against any internal
    // caller that bypasses /api/deal/enter.
    assertTradingHoursWithCloseGrace();

    // One verified entry per (traderId, dealId) — prevents double on-chain entry on retry.
    const existingByPair = await ctx.db
      .query("dealEntries")
      .withIndex("byTraderAndDeal", (q) =>
        q.eq("traderId", args.traderId).eq("dealId", args.dealId)
      )
      .unique();

    if (existingByPair) {
      if (
        existingByPair.paymentId.startsWith("pending:") &&
        existingByPair.paymentId !== args.paymentId
      ) {
        await ctx.db.patch(existingByPair._id, {
          paymentId: args.paymentId,
          enterTxHash: args.enterTxHash,
          resolveTxHash: args.resolveTxHash,
          onChainDealId: args.onChainDealId,
        });
        const dealDoc = await ctx.db.get(args.dealId);
        if (dealDoc && !existingByPair.enterTxHash) {
          await ctx.db.patch(args.dealId, {
            entryCount: (dealDoc.entryCount ?? 0) + 1,
            updatedAt: Date.now(),
          });
        }
      }
      return existingByPair._id;
    }

    // CAS guard: one verified entry per paymentId
    const existing = await ctx.db
      .query("dealEntries")
      .withIndex("byPaymentId", (q) => q.eq("paymentId", args.paymentId))
      .unique();
    if (existing) return existing._id;

    const dealDoc = await ctx.db.get(args.dealId);
    if (!dealDoc) {
      throw new Error("Deal not found");
    }
    if (dealDoc.status !== "open") {
      throw new Error("Deal is not open");
    }
    const traderDoc = await ctx.db.get(args.traderId as Id<"traders">);
    if (!traderDoc) {
      throw new Error("Trader not found");
    }
    if (traderDoc.status !== "active") {
      throw new Error("Trader is not active");
    }
    if (args.entryCostUsdc !== dealDoc.entryCostUsdc) {
      throw new Error("Entry cost mismatch");
    }
    if (
      isOwnDeskCreatedDeal(
        { creatorDeskManagerId: dealDoc.creatorDeskManagerId },
        String(traderDoc.deskManagerId)
      )
    ) {
      throw new Error("Trader cannot enter deals created by its own desk.");
    }

    const id = await ctx.db.insert("dealEntries", {
      ...args,
      createdAt: Date.now(),
    });

    // Also increment entryCount on the parent deal (best-effort)
    await ctx.db.patch(args.dealId, {
      entryCount: (dealDoc.entryCount ?? 0) + 1,
      updatedAt: Date.now(),
    });

    return id;
  },
});
