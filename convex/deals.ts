import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { isOwnDeskCreatedDeal } from "./lib/dealEntryEligibility";
import { dealCreationCapFields } from "./lib/extractionCap";
import { clampLimit } from "./lib/limits";
import { assertTradingHoursWithCloseGrace } from "./lib/tradingHours";
import { isMcpSubject } from "./mcp/subject";

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
      const isAgent = isMcpSubject(dm?.subject);
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

async function assertTraderCanEnterDeal(
  ctx: MutationCtx,
  dealDoc: Doc<"deals">,
  traderDoc: Doc<"traders">
): Promise<void> {
  const dm = await ctx.db.get(traderDoc.deskManagerId);
  if (
    isOwnDeskCreatedDeal(
      {
        creatorDeskManagerId: dealDoc.creatorDeskManagerId,
        creatorAddress: dealDoc.creatorAddress,
      },
      {
        deskManagerId: String(traderDoc.deskManagerId),
        deskWalletAddress: dm?.walletAddress,
      }
    )
  ) {
    throw new Error("Trader cannot enter deals created by its own desk.");
  }
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

// ── Public deal recording (Privy browser path) ─────────────────────────────

/** Internal: idempotent insert after on-chain DealCreated verification. */
export const recordOnChainCreationVerified = internalMutation({
  args: {
    deskManagerId: v.id("deskManagers"),
    onChainDealId: v.number(),
    onChainTxHash: v.string(),
    prompt: v.string(),
    potUsdc: v.number(),
    entryCostUsdc: v.number(),
    sourceHeadline: v.optional(v.string()),
    wireDealSeedId: v.optional(v.id("wireDealSeeds")),
  },
  returns: v.id("deals"),
  handler: async (ctx, args): Promise<Id<"deals">> => {
    const dm = await ctx.db.get(args.deskManagerId);
    if (!dm) throw new Error("Desk manager not found");

    const existing = await ctx.db
      .query("deals")
      .withIndex("byOnChainDealId", (q) =>
        q.eq("onChainDealId", args.onChainDealId)
      )
      .unique();
    if (existing) return existing._id;

    const now = Date.now();
    const dealId = await ctx.db.insert("deals", {
      creatorDeskManagerId: args.deskManagerId,
      creatorAddress: dm.walletAddress,
      creatorType: "desk_manager",
      prompt: args.prompt,
      potUsdc: args.potUsdc,
      entryCostUsdc: args.entryCostUsdc,
      ...dealCreationCapFields(args.potUsdc),
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
        deskManagerId: args.deskManagerId,
        createdAt: now,
      });
    }

    return dealId;
  },
});

export const findByOnChainDealIdInternal = internalQuery({
  args: { onChainDealId: v.number() },
  returns: v.union(v.id("deals"), v.null()),
  handler: async (ctx, { onChainDealId }) => {
    const deal = await ctx.db
      .query("deals")
      .withIndex("byOnChainDealId", (q) => q.eq("onChainDealId", onChainDealId))
      .unique();
    return deal?._id ?? null;
  },
});

/**
 * Public: record a user-created on-chain deal in Convex after verifying the
 * createDeal tx on-chain. Idempotent on `onChainDealId`.
 */
export const recordOnChainCreation = action({
  args: {
    onChainDealId: v.number(),
    onChainTxHash: v.string(),
    prompt: v.string(),
    potUsdc: v.number(),
    entryCostUsdc: v.number(),
    sourceHeadline: v.optional(v.string()),
    wireDealSeedId: v.optional(v.id("wireDealSeeds")),
  },
  returns: v.id("deals"),
  handler: async (ctx, args): Promise<Id<"deals">> => {
    assertTradingHoursWithCloseGrace();

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const dm = await ctx.runQuery(internal.deskManagers.getBySubject, {
      subject: identity.subject,
    });
    if (!dm) throw new Error("Desk manager not found");
    if (!dm.walletAddress) {
      throw new Error("Desk wallet not on file");
    }

    const existingId = await ctx.runQuery(
      internal.deals.findByOnChainDealIdInternal,
      { onChainDealId: args.onChainDealId }
    );
    if (existingId) return existingId;

    if ((dm.walletBalanceUsdc ?? 0) <= 0) {
      throw new Error("Fund your wallet before creating a deal");
    }

    const verified = await ctx.runAction(
      internal.mcp.dealCreatedVerify.verifyDealCreatedFromTx,
      {
        txHash: args.onChainTxHash,
        onChainDealId: args.onChainDealId,
        expectedCreator: dm.walletAddress,
      }
    );

    return await ctx.runMutation(internal.deals.recordOnChainCreationVerified, {
      deskManagerId: dm._id,
      onChainDealId: args.onChainDealId,
      onChainTxHash: args.onChainTxHash,
      prompt: verified.prompt,
      potUsdc: verified.potUsdc,
      entryCostUsdc: verified.entryCostUsdc,
      sourceHeadline: args.sourceHeadline,
      wireDealSeedId: args.wireDealSeedId,
    });
  },
});

// ── Public mutations (auth-checked) ────────────────────────────────────────

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
  args: { traderId: v.id("traders"), dealId: v.id("deals") },
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
    traderId: v.id("traders"),
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

    const traderDoc = await ctx.db.get(args.traderId);
    if (!traderDoc) throw new Error("Trader not found");
    if (traderDoc.status !== "active") {
      throw new Error("Trader is not active");
    }
    await assertTraderCanEnterDeal(ctx, dealDoc, traderDoc);

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
    traderId: v.id("traders"),
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
        // Same invariants as the fresh-insert path: deal still open, trader
        // still active, entry cost matches, not own-desk. State can change
        // between beginEntryRecording and the upgrade call.
        const dealDoc = await ctx.db.get(args.dealId);
        if (!dealDoc) throw new Error("Deal not found");
        if (dealDoc.status !== "open") throw new Error("Deal is not open");
        const traderDoc = await ctx.db.get(args.traderId);
        if (!traderDoc) throw new Error("Trader not found");
        if (traderDoc.status !== "active") {
          throw new Error("Trader is not active");
        }
        if (args.entryCostUsdc !== dealDoc.entryCostUsdc) {
          throw new Error("Entry cost mismatch");
        }
        await assertTraderCanEnterDeal(ctx, dealDoc, traderDoc);

        await ctx.db.patch(existingByPair._id, {
          paymentId: args.paymentId,
          enterTxHash: args.enterTxHash,
          resolveTxHash: args.resolveTxHash,
          onChainDealId: args.onChainDealId,
        });
        if (!existingByPair.enterTxHash) {
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
    const traderDoc = await ctx.db.get(args.traderId);
    if (!traderDoc) {
      throw new Error("Trader not found");
    }
    if (traderDoc.status !== "active") {
      throw new Error("Trader is not active");
    }
    if (args.entryCostUsdc !== dealDoc.entryCostUsdc) {
      throw new Error("Entry cost mismatch");
    }
    await assertTraderCanEnterDeal(ctx, dealDoc, traderDoc);

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

// ── Orphaned-entry reconciliation ─────────────────────────────────────────
//
// The deal-entry flow is two steps: `beginEntryRecording` writes a
// `pending:<trader>:<deal>` reservation row, then the on-chain `enterDeal`
// lands and `recordVerifiedEntry` upgrades the row (real paymentId +
// enterTxHash + entryCount bump). If the process dies between the on-chain tx
// and the Convex write, the reservation is orphaned: the contract counts the
// entry in `pendingEntries` (blocking the creator from closing the deal), but
// Convex only holds a stale `pending:` row that never gets an outcome — so the
// cycle's on-chain settlement retry (which requires an existing outcome) never
// fires for it. `reconcileOrphanEntries` (convex/agent/reconcileEntries.ts)
// sweeps these and settles/clears them.

export type OrphanEntry = {
  entryId: Id<"dealEntries">;
  onChainDealId: number | null;
  tokenId: number | null;
  entryCostUsdc: number;
};

/**
 * Internal: find stale `pending:` deal entries on still-open deals whose
 * on-chain state may need reconciling. All reservation rows share the
 * `pending:` paymentId prefix (verified rows carry real settlement ids), so we
 * range-scan the `byPaymentId` index directly instead of walking every open
 * deal. Returns rows older than `cutoffMs` that were never upgraded to a
 * verified entry (no enterTxHash) and whose deal is still open.
 */
export const listStaleOrphanEntries = internalQuery({
  args: { cutoffMs: v.number() },
  handler: async (ctx, { cutoffMs }): Promise<OrphanEntry[]> => {
    // `;` is the character after `:`, so [`pending:`, `pending;`) is exactly
    // the set of paymentIds beginning with `pending:`.
    const pendingEntries = await ctx.db
      .query("dealEntries")
      .withIndex("byPaymentId", (q) =>
        q.gte("paymentId", "pending:").lt("paymentId", "pending;")
      )
      .collect();

    const orphans: OrphanEntry[] = [];
    for (const entry of pendingEntries) {
      if (entry.enterTxHash) continue;
      if (entry.createdAt >= cutoffMs) continue; // still in-flight

      const deal = await ctx.db.get(entry.dealId);
      if (!deal || deal.status !== "open") continue;

      const trader = await ctx.db.get(entry.traderId);
      orphans.push({
        entryId: entry._id,
        onChainDealId: entry.onChainDealId ?? deal.onChainDealId ?? null,
        tokenId: trader?.tokenId ?? null,
        entryCostUsdc: entry.entryCostUsdc,
      });
    }
    return orphans;
  },
});

// ── Stuck verified-entry reconciliation ──────────────────────────────────
//
// A distinct failure window from the orphan case above. Here the entry is
// FULLY verified in Convex (real paymentId + enterTxHash, entryCount bumped)
// and an outcome exists — but the outcome was *voided* with a `reconciled:*`
// sentinel because `resolveOnChainEntry` read a stale `pendingEntries === 0`
// and concluded the deal was already settled, so it never called
// `resolveEntry`. On-chain the trader's entry is still pending, blocking the
// creator from closing. Neither the orphan sweep (only scans `pending:` rows)
// nor the cycle §3c retry (`findUnresolvedOnChain` skips outcomes that already
// carry an `onChainTxHash`, sentinel included) can recover it — so this sweep
// re-checks the contract and settles any genuinely-pending entry break-even.

export type StuckEntry = {
  entryId: Id<"dealEntries">;
  outcomeId: Id<"dealOutcomes">;
  traderId: Id<"traders">;
  dealId: Id<"deals">;
  onChainDealId: number;
  tokenId: number;
  entryCostUsdc: number;
};

/**
 * Internal: find verified deal entries on still-open deals whose outcome was
 * voided with a `reconciled:*` sentinel — candidates for on-chain settlement
 * re-check. We only consider entries older than `cutoffMs` (never race a live
 * cycle mid-resolution). Entries whose outcome carries a real `0x…` tx are
 * settled; entries whose outcome has no tx yet are owned by the cycle §3c
 * FIFO-retry path and left alone.
 */
export const listStuckVerifiedEntries = internalQuery({
  args: { cutoffMs: v.number() },
  handler: async (ctx, { cutoffMs }): Promise<StuckEntry[]> => {
    const openDeals = await ctx.db
      .query("deals")
      .withIndex("byStatus", (q) => q.eq("status", "open"))
      .collect();

    const stuck: StuckEntry[] = [];
    for (const deal of openDeals) {
      if (deal.onChainDealId === undefined || deal.onChainDealId === null) {
        continue;
      }
      const entries = await ctx.db
        .query("dealEntries")
        .withIndex("byDeal", (q) => q.eq("dealId", deal._id))
        .collect();

      for (const entry of entries) {
        // Verified entries only — `pending:` reservations are the orphan sweep's
        // job (see listStaleOrphanEntries).
        if (!entry.enterTxHash) continue;
        if (entry.paymentId.startsWith("pending:")) continue;
        if (entry.createdAt >= cutoffMs) continue; // still in-flight

        const outcome = await ctx.db
          .query("dealOutcomes")
          .withIndex("byTraderAndDeal", (q) =>
            q.eq("traderId", entry.traderId).eq("dealId", deal._id)
          )
          .unique();
        if (!outcome) continue;
        const tx = outcome.onChainTxHash;
        // Only voided (`reconciled:*`) outcomes are candidates. A real `0x…` tx
        // means it settled; an absent tx means the cycle still owns the retry.
        if (typeof tx !== "string" || !tx.startsWith("reconciled:")) continue;

        const trader = await ctx.db.get(entry.traderId);
        if (
          !trader ||
          trader.tokenId === undefined ||
          trader.tokenId === null
        ) {
          continue;
        }

        stuck.push({
          entryId: entry._id,
          outcomeId: outcome._id,
          traderId: entry.traderId,
          dealId: deal._id,
          onChainDealId: deal.onChainDealId,
          tokenId: trader.tokenId,
          entryCostUsdc: entry.entryCostUsdc,
        });
      }
    }
    return stuck;
  },
});

/**
 * Internal: record that a stuck verified entry was settled on-chain. Replaces
 * the outcome's `reconciled:*` sentinel with the real resolve tx (never
 * clobbers a genuine `0x…` settlement) and logs a `reconcile` activity row.
 * The on-chain resolve is break-even (entry cost refunded, no pnl/rake) — the
 * outcome was voided, so no off-chain PnL is applied; the chain balance sync
 * remains the source of truth.
 */
export const settleStuckOnChainEntry = internalMutation({
  args: {
    entryId: v.id("dealEntries"),
    outcomeId: v.id("dealOutcomes"),
    resolveTxHash: v.string(),
  },
  handler: async (ctx, { entryId, outcomeId, resolveTxHash }) => {
    const entry = await ctx.db.get(entryId);
    if (!entry) return { settled: false as const };

    const outcome = await ctx.db.get(outcomeId);
    if (outcome) {
      const tx = outcome.onChainTxHash;
      if (typeof tx !== "string" || !tx.startsWith("0x")) {
        await ctx.db.patch(outcomeId, { onChainTxHash: resolveTxHash });
      }
    }

    await ctx.db.insert("agentActivityLog", {
      traderId: entry.traderId,
      activityType: "reconcile",
      message: resolveTxHash.startsWith("0x")
        ? `Stuck on-chain deal entry settled break-even and cleared (tx=${resolveTxHash})`
        : `Stuck on-chain deal entry confirmed already settled (${resolveTxHash})`,
      dealId: entry.dealId,
      metadata: {
        entry_id: entryId,
        resolve_tx_hash: resolveTxHash,
      },
      dedupeKey: `reconcile-stuck:${entryId}:${resolveTxHash}`,
      createdAt: Date.now(),
    });

    return { settled: true as const };
  },
});

/**
 * Internal: clear a reconciled orphan reservation row. Deletes the stale
 * `pending:` entry (freeing the unique (trader, deal) slot so a legit retry can
 * re-enter if the deal is still open) and logs a `reconcile` activity row.
 *
 * Guard: only deletes rows still in the orphaned state (paymentId `pending:`,
 * no enterTxHash) so it can never clobber a concurrently-verified entry.
 */
export const clearOrphanEntry = internalMutation({
  args: {
    entryId: v.id("dealEntries"),
    resolveTxHash: v.optional(v.string()),
    note: v.string(),
  },
  handler: async (ctx, { entryId, resolveTxHash, note }) => {
    const entry = await ctx.db.get(entryId);
    if (!entry) return { cleared: false as const };
    if (!entry.paymentId.startsWith("pending:") || entry.enterTxHash) {
      // Row was upgraded to a real verified entry in the meantime — leave it.
      return { cleared: false as const };
    }

    await ctx.db.delete(entryId);

    await ctx.db.insert("agentActivityLog", {
      traderId: entry.traderId,
      activityType: "reconcile",
      message: resolveTxHash
        ? `Orphaned deal entry refunded on-chain and cleared (${note}, tx=${resolveTxHash})`
        : `Orphaned deal entry cleared (${note})`,
      dealId: entry.dealId,
      metadata: {
        entry_id: entryId,
        resolve_tx_hash: resolveTxHash ?? null,
      },
      dedupeKey: `reconcile:${entryId}`,
      createdAt: Date.now(),
    });

    return { cleared: true as const };
  },
});
