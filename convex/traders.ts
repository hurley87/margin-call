import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  resolveReadyProfileImageUrl,
  resolveTraderProfileImageUrl,
} from "./lib/profileImage";
import { buildPortraitSeed } from "./lib/portraitSeed";

async function toTraderReadModel(ctx: QueryCtx, trader: Doc<"traders">) {
  return {
    _id: trader._id,
    _creationTime: trader._creationTime,
    deskManagerId: trader.deskManagerId,
    ownerSubject: trader.ownerSubject,
    name: trader.name,
    status: trader.status,
    mandate: trader.mandate,
    personality: trader.personality,
    escrowBalanceUsdc: trader.escrowBalanceUsdc,
    lastOutcomeId: trader.lastOutcomeId,
    lastCycleAt: trader.lastCycleAt,
    cycleLeaseUntil: trader.cycleLeaseUntil,
    cycleGeneration: trader.cycleGeneration,
    walletStatus: trader.walletStatus,
    walletError: trader.walletError,
    cdpWalletAddress: trader.cdpWalletAddress,
    cdpOwnerAddress: trader.cdpOwnerAddress,
    cdpAccountName: trader.cdpAccountName,
    tokenId: trader.tokenId,
    tbaAddress: trader.tbaAddress,
    imageStatus: trader.imageStatus,
    profileImageUrl: await resolveTraderProfileImageUrl(ctx, trader),
    createdAt: trader.createdAt,
    updatedAt: trader.updatedAt,
  };
}

function humanizeImageVariant(variant: string | undefined): string {
  if (!variant) return "Wall Street Operator";
  return variant
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function deriveRiskProfile(mandate: unknown): string {
  if (!mandate || typeof mandate !== "object" || Array.isArray(mandate)) {
    return "Balanced";
  }

  const values = mandate as Record<string, unknown>;
  const bankrollPct = Number(values.bankroll_pct ?? 0);
  const maxEntryCost = Number(values.max_entry_cost_usdc ?? 0);

  if (bankrollPct >= 50 || maxEntryCost >= 500) return "Aggressive";
  if ((bankrollPct > 0 && bankrollPct <= 10) || maxEntryCost <= 25) {
    return "Conservative";
  }
  return "Balanced";
}

/** Shared slice for unauthenticated trader surfaces (metadata + public profile). */
async function publicTraderBasics(ctx: QueryCtx, trader: Doc<"traders">) {
  return {
    traderId: trader._id,
    name: trader.name,
    status: trader.status,
    portraitStatus: trader.imageStatus ?? "pending",
    archetype: humanizeImageVariant(trader.imageVariant),
    riskProfile: deriveRiskProfile(trader.mandate),
    tokenId: trader.tokenId ?? null,
    profileImageUrl: await resolveReadyProfileImageUrl(ctx, trader),
  };
}

/** Public: list traders owned by the calling desk manager. */
export const listByDesk = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const traders = await ctx.db
      .query("traders")
      .withIndex("byOwner", (q) => q.eq("ownerSubject", identity.subject))
      .collect();
    return Promise.all(traders.map((trader) => toTraderReadModel(ctx, trader)));
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
    return toTraderReadModel(ctx, trader);
  },
});

/**
 * Public: curated trader metadata read model for NFT metadata routes.
 * This intentionally excludes owner, wallet, mandate, personality, raw image
 * prompt/source, dedupe, and error fields.
 */
export const getPublicMetadata = query({
  args: { traderId: v.id("traders") },
  handler: async (ctx, { traderId }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) return null;
    return publicTraderBasics(ctx, trader);
  },
});

/**
 * Public: curated trader profile read model for read-only profile pages.
 * This intentionally excludes owner, desk manager, wallet internals, mandate,
 * personality, raw portrait prompt/source, errors, lease fields, metadata blobs,
 * and private controls.
 */
export const getPublicProfile = query({
  args: { traderId: v.id("traders") },
  handler: async (ctx, { traderId }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) return null;

    const recentActivity = await ctx.db
      .query("agentActivityLog")
      .withIndex("byTraderAndCreatedAt", (q) => q.eq("traderId", traderId))
      .order("desc")
      .take(5);

    const basics = await publicTraderBasics(ctx, trader);
    return {
      ...basics,
      escrowBalanceUsdc: trader.escrowBalanceUsdc ?? 0,
      recentActivity: recentActivity.map((entry) => ({
        activityType: entry.activityType,
        message: entry.message,
        dealId: entry.dealId ?? null,
        createdAt: entry.createdAt,
      })),
    };
  },
});

const MANDATE_NUMERIC_KEYS = [
  "max_entry_cost_usdc",
  "min_pot_usdc",
  "max_pot_usdc",
  "bankroll_pct",
  "approval_threshold_usdc",
] as const;

/** Update mandate + personality for owned trader (Convex-native; replaces desk/configure for game UI). */
export const updateMandate = mutation({
  args: {
    traderId: v.id("traders"),
    mandate: v.any(),
    personality: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { traderId, mandate, personality }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const trader = await ctx.db.get(traderId);
    if (!trader || trader.ownerSubject !== identity.subject) {
      throw new Error("Forbidden");
    }

    if (!mandate || typeof mandate !== "object" || Array.isArray(mandate)) {
      throw new Error("mandate must be an object");
    }

    const cleaned: Record<string, unknown> = {};

    for (const key of MANDATE_NUMERIC_KEYS) {
      if (!(key in mandate)) continue;
      const val = (mandate as Record<string, unknown>)[key];
      if (val === null || val === undefined) continue;
      const num = Number(val);
      if (Number.isNaN(num) || num < 0) {
        throw new Error(`${key} must be a non-negative number`);
      }
      if (key === "bankroll_pct" && (num <= 0 || num > 100)) {
        throw new Error("bankroll_pct must be between 1 and 100");
      }
      cleaned[key] = num;
    }

    if ("keywords" in mandate) {
      const val = (mandate as Record<string, unknown>).keywords;
      if (
        !Array.isArray(val) ||
        !val.every((entry) => typeof entry === "string")
      ) {
        throw new Error("keywords must be an array of strings");
      }
      cleaned.keywords = val;
    }

    if ("llm_deal_selection" in mandate) {
      const val = (mandate as Record<string, unknown>).llm_deal_selection;
      if (typeof val !== "boolean") {
        throw new Error("llm_deal_selection must be a boolean");
      }
      cleaned.llm_deal_selection = val;
    }

    const existingMandate =
      (trader.mandate as Record<string, unknown> | undefined) ?? {};

    const patch: Partial<
      Pick<Doc<"traders">, "mandate" | "personality" | "updatedAt">
    > = {
      mandate: { ...existingMandate, ...cleaned },
      updatedAt: Date.now(),
    };

    if (personality !== undefined) {
      if (personality !== null && typeof personality !== "string") {
        throw new Error("personality must be a string or null");
      }
      if (typeof personality === "string" && personality.length > 2000) {
        throw new Error("personality must be at most 2000 characters");
      }
      patch.personality =
        personality === null ? undefined : personality.trim() || undefined;
    }

    await ctx.db.patch(traderId, patch);
    return { ok: true as const };
  },
});

/** Public: set status (pause/resume/revive) for an owned trader. */
export const setStatus = mutation({
  args: {
    traderId: v.id("traders"),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("wiped_out")
    ),
  },
  handler: async (ctx, { traderId, status }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const trader = await ctx.db.get(traderId);
    if (!trader || trader.ownerSubject !== identity.subject) {
      throw new Error("Forbidden");
    }

    if (status === "active") {
      if (trader.status === "wiped_out") {
        throw new Error("Cannot activate a wiped out trader");
      }
      if (trader.walletStatus !== "ready") {
        throw new Error("Trader wallet must be ready before activation");
      }
      if ((trader.escrowBalanceUsdc ?? 0) <= 0) {
        throw new Error("Fund trader before activating");
      }
    }

    await ctx.db.patch(traderId, { status, updatedAt: Date.now() });
    return { ok: true as const };
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
    const portraitSeed = buildPortraitSeed({
      ownerSubject: identity.subject,
      name: args.name,
      mandate: args.mandate ?? {},
      personality: args.personality,
    });
    const traderId = await ctx.db.insert("traders", {
      deskManagerId: existing._id,
      ownerSubject: identity.subject,
      name: args.name,
      status: "paused",
      mandate: args.mandate ?? {},
      personality: args.personality,
      ...portraitSeed,
      walletStatus: "pending",
      escrowBalanceUsdc: 0,
      createdAt: now,
      updatedAt: now,
    });

    // Schedule wallet creation as an internal action (no CDP inside mutations).
    // Vitest sets MC_SKIP_WALLET_SCHEDULE (see vitest.config.ts):
    // convex-test runs scheduled actions without a full transaction context, so
    // createForTrader's ctx.runQuery fails with "Transaction not started" and
    // spams stderr — behavior tests seed traders directly or use markCreating instead.
    if (process.env.MC_SKIP_WALLET_SCHEDULE !== "1") {
      await ctx.scheduler.runAfter(0, internal.wallet.createForTrader, {
        traderId,
      });
      await ctx.scheduler.runAfter(0, internal.portraits.generateForTrader, {
        traderId,
      });
    }

    return traderId;
  },
});

/** Public: retry portrait generation for an owned trader. */
export const retryPortrait = mutation({
  args: { traderId: v.id("traders") },
  handler: async (ctx, { traderId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const trader = await ctx.db.get(traderId);
    if (!trader || trader.ownerSubject !== identity.subject) {
      throw new Error("Forbidden");
    }

    if (trader.imageStatus === "ready" && trader.profileImageStorageId) {
      return { ok: true as const, status: "ready" as const };
    }

    await ctx.db.patch(traderId, {
      imageStatus: "pending",
      imageError: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.portraits.generateForTrader, {
      traderId,
    });
    return { ok: true as const, status: "scheduled" as const };
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

/** Internal: transition portrait pending|error -> generating. */
export const markPortraitGenerating = internalMutation({
  args: { traderId: v.id("traders"), force: v.optional(v.boolean()) },
  handler: async (ctx, { traderId, force }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) return null;
    if (
      !force &&
      trader.imageStatus === "ready" &&
      trader.profileImageStorageId
    ) {
      return null;
    }
    if (trader.imageStatus === "generating") {
      return trader;
    }

    const promptVersion =
      typeof trader.imagePromptSource === "object" &&
      trader.imagePromptSource !== null &&
      "version" in trader.imagePromptSource &&
      typeof trader.imagePromptSource.version === "number"
        ? trader.imagePromptSource.version
        : 0;
    const seedPatch =
      trader.imagePrompt && trader.imageStyleSeed && promptVersion >= 2
        ? {}
        : buildPortraitSeed({
            ownerSubject: trader.ownerSubject,
            name: trader.name,
            mandate: trader.mandate ?? {},
            personality: trader.personality,
          });
    const patch = {
      ...seedPatch,
      imageStatus: "generating",
      imageLastAttemptAt: Date.now(),
      imageRetryCount: (trader.imageRetryCount ?? 0) + 1,
      imageError: undefined,
      updatedAt: Date.now(),
    } as const;

    await ctx.db.patch(traderId, patch);

    return { ...trader, ...patch };
  },
});

/** Internal: store successful portrait generation metadata. */
export const applyPortraitReady = internalMutation({
  args: {
    traderId: v.id("traders"),
    profileImageStorageId: v.id("_storage"),
  },
  handler: async (ctx, { traderId, profileImageStorageId }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) return;
    await ctx.db.patch(traderId, {
      profileImageStorageId,
      imageStatus: "ready",
      imageError: undefined,
      updatedAt: Date.now(),
    });
  },
});

/** Internal: record portrait generation failure. */
export const applyPortraitError = internalMutation({
  args: { traderId: v.id("traders"), error: v.string() },
  handler: async (ctx, { traderId, error }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) return;
    if (trader.imageStatus === "ready" && trader.profileImageStorageId) return;
    await ctx.db.patch(traderId, {
      imageStatus: "error",
      imageError: error,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: apply a PnL outcome to a trader's escrow balance.
 * CAS on traderId: reads current balance, applies delta, clamps to zero.
 * If the resulting balance reaches zero, transitions status → "wiped_out".
 * Idempotent: same outcomeId returns without re-applying.
 */
export const applyOutcomeBalance = internalMutation({
  args: {
    traderId: v.id("traders"),
    pnlUsdc: v.number(),
    /** Outcome document id — idempotency key; persisted as lastOutcomeId. */
    outcomeId: v.id("dealOutcomes"),
  },
  handler: async (ctx, { traderId, pnlUsdc, outcomeId }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) return null;

    // Idempotency: if this outcome was already applied, no-op
    if (trader.lastOutcomeId === outcomeId) {
      return {
        escrowBalanceUsdc: trader.escrowBalanceUsdc ?? 0,
        wipedOut: trader.status === "wiped_out",
      };
    }

    const currentBalance = trader.escrowBalanceUsdc ?? 0;
    const newBalance = Math.max(0, currentBalance + pnlUsdc);
    const wipedOut = newBalance <= 0;

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

    return { escrowBalanceUsdc: newBalance, wipedOut };
  },
});

/** Internal: overwrite escrowBalanceUsdc from a fresh on-chain read. */
export const syncEscrowBalance = internalMutation({
  args: { traderId: v.id("traders"), balanceUsdc: v.number() },
  handler: async (ctx, { traderId, balanceUsdc }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) return;
    await ctx.db.patch(traderId, {
      escrowBalanceUsdc: balanceUsdc,
      updatedAt: Date.now(),
    });
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
