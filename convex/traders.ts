import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";

/** Public: list traders owned by the calling desk manager. */
export const listByDesk = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return ctx.db
      .query("traders")
      .withIndex("byOwner", (q) => q.eq("ownerSubject", identity.subject))
      .collect();
  },
});

/** Public: get a trader by id, auth-checked (must be owner). */
export const getById = query({
  args: { traderId: v.id("traders") },
  handler: async (ctx, { traderId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const trader = await ctx.db.get(traderId);
    if (!trader || trader.ownerSubject !== identity.subject) return null;
    return trader;
  },
});

/** Public: create a trader, schedule wallet creation. Idempotent on (ownerSubject, name). */
export const create = mutation({
  args: {
    name: v.string(),
    mandate: v.optional(v.any()),
    personality: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    // Resolve or create deskManager row
    const existing = await ctx.db
      .query("deskManagers")
      .withIndex("bySubject", (q) => q.eq("subject", identity.subject))
      .unique();
    if (!existing)
      throw new Error("Desk manager not found — call upsertMe first");

    // Idempotency: check for existing trader with same owner+name
    const dupe = await ctx.db
      .query("traders")
      .withIndex("byOwnerAndName", (q) =>
        q.eq("ownerSubject", identity.subject).eq("name", args.name)
      )
      .unique();

    if (dupe) {
      // If wallet job is already in-flight or done, return existing trader
      if (dupe.walletStatus !== "error") return dupe._id;
      // Error state: allow retry — fall through to create new trader
    }

    const now = Date.now();
    const traderId = await ctx.db.insert("traders", {
      deskManagerId: existing._id,
      ownerSubject: identity.subject,
      name: args.name,
      status: "active",
      mandate: args.mandate ?? {},
      personality: args.personality,
      walletStatus: "pending",
      escrowBalanceUsdc: 0,
      createdAt: now,
      updatedAt: now,
    });

    // Schedule wallet creation as an internal action (no CDP inside mutations).
    // Vitest sets MARGIN_CALL_CONVEX_TEST_SKIP_WALLET_SCHEDULE (see vitest.config.ts):
    // convex-test runs scheduled actions without a full transaction context, so
    // createForTrader's ctx.runQuery fails with "Transaction not started" and
    // spams stderr — behavior tests seed traders directly or use markCreating instead.
    if (process.env.MARGIN_CALL_CONVEX_TEST_SKIP_WALLET_SCHEDULE !== "1") {
      await ctx.scheduler.runAfter(0, internal.wallet.createForTrader, {
        traderId,
      });
    }

    return traderId;
  },
});

// ── Internal helpers (used by wallet action) ─────────────────────────────────

/** Internal: load trader without auth (for wallet action). */
export const loadInternal = internalQuery({
  args: { traderId: v.id("traders") },
  handler: async (ctx, { traderId }) => ctx.db.get(traderId),
});

/** Internal: transition walletStatus pending|creating → creating. */
export const markCreating = internalMutation({
  args: { traderId: v.id("traders") },
  handler: async (ctx, { traderId }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) return;
    if (trader.walletStatus !== "pending") return; // already progressed
    await ctx.db.patch(traderId, {
      walletStatus: "creating",
      updatedAt: Date.now(),
    });
  },
});

/** Internal: transition creating → ready with wallet metadata. */
export const applyWalletReady = internalMutation({
  args: {
    traderId: v.id("traders"),
    cdpWalletAddress: v.string(),
    cdpOwnerAddress: v.string(),
    cdpAccountName: v.string(),
    tokenId: v.number(),
  },
  handler: async (ctx, { traderId, ...walletMeta }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) return;
    // CAS: only transition from pending or creating
    if (trader.walletStatus === "ready") return;
    await ctx.db.patch(traderId, {
      walletStatus: "ready",
      cdpWalletAddress: walletMeta.cdpWalletAddress,
      cdpOwnerAddress: walletMeta.cdpOwnerAddress,
      cdpAccountName: walletMeta.cdpAccountName,
      tokenId: walletMeta.tokenId,
      walletError: undefined,
      updatedAt: Date.now(),
    });
  },
});

/** Internal: transition pending|creating → error. */
export const applyWalletError = internalMutation({
  args: { traderId: v.id("traders"), error: v.string() },
  handler: async (ctx, { traderId, error }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) return;
    if (trader.walletStatus === "ready") return; // don't clobber success
    await ctx.db.patch(traderId, {
      walletStatus: "error",
      walletError: error,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: apply a PnL outcome to a trader's escrow balance.
 * CAS on traderId: reads current balance, applies delta, clamps to zero.
 * If wipedOut is true, transitions status → "wiped_out".
 * Idempotent: same outcomeId returns without re-applying.
 */
export const applyOutcomeBalance = internalMutation({
  args: {
    traderId: v.id("traders"),
    pnlUsdc: v.number(),
    wipedOut: v.boolean(),
    /** Outcome document id — idempotency key; persisted as lastOutcomeId. */
    outcomeId: v.id("dealOutcomes"),
  },
  handler: async (ctx, { traderId, pnlUsdc, wipedOut, outcomeId }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) return;

    // Idempotency: if this outcome was already applied, no-op
    if (trader.lastOutcomeId === outcomeId) return;

    const currentBalance = trader.escrowBalanceUsdc ?? 0;
    const newBalance = Math.max(0, currentBalance + pnlUsdc);

    const patch: Partial<
      Pick<
        Doc<"traders">,
        "escrowBalanceUsdc" | "lastOutcomeId" | "updatedAt" | "status"
      >
    > = {
      escrowBalanceUsdc: newBalance,
      lastOutcomeId: outcomeId,
      updatedAt: Date.now(),
    };

    if (wipedOut) {
      patch.status = "wiped_out";
    }

    await ctx.db.patch(traderId, patch);
  },
});

/**
 * Internal: update a trader's cached escrow balance.
 * Called from the x402 deal/enter route after on-chain resolution to keep
 * the Convex record aligned with chain state.
 */
export const updateEscrowBalance = internalMutation({
  args: { traderId: v.id("traders"), escrowBalanceUsdc: v.number() },
  handler: async (ctx, { traderId, escrowBalanceUsdc }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) return;
    await ctx.db.patch(traderId, {
      escrowBalanceUsdc,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: find a trader by ERC-8004 tokenId.
 * Used by the x402 deal/enter route to look up the trader from SIWA auth.
 */
export const getByTokenIdInternal = internalQuery({
  args: { tokenId: v.number() },
  handler: async (ctx, { tokenId }) => {
    const traders = await ctx.db.query("traders").collect();
    return traders.find((t) => t.tokenId === tokenId) ?? null;
  },
});

/**
 * Internal: load trader by Convex id and verify it is owned by the given
 * wallet address (cdpWalletAddress or owner lookup via deskManager).
 * Used by the x402 deal/enter route for Privy user ownership checks.
 */
export const getByIdForOwnerInternal = internalQuery({
  args: { traderId: v.id("traders"), walletAddress: v.string() },
  handler: async (ctx, { traderId, walletAddress }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) return null;
    // Ownership: check cdpWalletAddress (agent wallet) or deskManager walletAddress
    if (
      trader.cdpWalletAddress?.toLowerCase() === walletAddress.toLowerCase()
    ) {
      return trader;
    }
    const dm = await ctx.db.get(trader.deskManagerId);
    if (dm?.walletAddress?.toLowerCase() === walletAddress.toLowerCase()) {
      return trader;
    }
    return null;
  },
});

/**
 * Internal: list traders on the same desk (same deskManagerId) excluding
 * the given traderId. Used for desk dedup in deal selection.
 */
export const listSiblingTraderIds = internalQuery({
  args: {
    deskManagerId: v.id("deskManagers"),
    excludeTraderId: v.id("traders"),
  },
  handler: async (ctx, { deskManagerId, excludeTraderId }) => {
    const traders = await ctx.db
      .query("traders")
      .withIndex("byDeskManager", (q) => q.eq("deskManagerId", deskManagerId))
      .collect();
    return traders
      .filter((t) => t._id !== excludeTraderId)
      .map((t) => t._id as string);
  },
});
