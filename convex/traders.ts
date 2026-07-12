import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  resolveReadyProfileImageUrl,
  resolveTraderProfileImageUrl,
} from "./lib/profileImage";
import { assertTradingHours } from "./lib/tradingHours";
import {
  buildPortraitSeed,
  composePromptFromStored,
  getPortraitPromptVersion,
  PORTRAIT_METADATA_VERSION,
  readPublicTraits,
  resolveTierFromTraitIds,
  stableHash,
} from "./lib/portraitSeed";
import { walletStepValidator } from "./schema";
import { TRADER_NAME_REGEX } from "../src/lib/trader-name";
import { normalizeEmail } from "../src/lib/email";
import { isMcpSubject } from "./mcp/subject";
import { resolvePublicTraderTier } from "./seatVault/publicDisplay";

// Vitest sets MC_SKIP_WALLET_SCHEDULE so any caller that would otherwise
// enqueue wallet.createForTrader skips the scheduler. convex-test runs
// scheduled actions without a full transaction context, so createForTrader's
// ctx.runQuery fails with "Transaction not started" and spams stderr —
// behavior tests seed traders directly or call markCreating instead.
const skipWalletSchedule = () => process.env.MC_SKIP_WALLET_SCHEDULE === "1";

export const TRADER_NAME_TAKEN_MESSAGE = "Trader name already taken";

/**
 * Global case-insensitive name uniqueness scan. Checks `byName` first to
 * catch legacy rows missing `nameLower`, then `byNameLower` for new rows.
 */
export async function findTraderNameConflict(
  ctx: QueryCtx,
  trimmedName: string,
  normalizedName: string,
  excludeTraderId?: Id<"traders">
): Promise<Doc<"traders"> | null> {
  const exactMatches = await ctx.db
    .query("traders")
    .withIndex("byName", (q) => q.eq("name", trimmedName))
    .take(10);
  const exactConflict = exactMatches.find(
    (trader) => trader._id !== excludeTraderId
  );
  if (exactConflict) return exactConflict;

  const lowerMatches = await ctx.db
    .query("traders")
    .withIndex("byNameLower", (q) => q.eq("nameLower", normalizedName))
    .take(10);
  return (
    lowerMatches.find(
      (trader) =>
        trader._id !== excludeTraderId &&
        trader.name.toLowerCase() === normalizedName
    ) ?? null
  );
}

/** Browser create path: schedule async wallet pipeline when row is pending/error. */
async function scheduleWalletForTrader(
  ctx: MutationCtx,
  traderId: Id<"traders">
) {
  if (skipWalletSchedule()) return;
  const trader = await ctx.db.get(traderId);
  if (!trader || trader.walletStatus === "ready") return;
  if (trader.walletStatus === "creating") return;
  if (trader.walletStatus === "pending" || trader.walletStatus === "error") {
    await ctx.scheduler.runAfter(0, internal.wallet.createForTrader, {
      traderId,
    });
  }
}

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
    walletStep: trader.walletStep,
    walletStepTokenId: trader.walletStepTokenId,
    cdpWalletAddress: trader.cdpWalletAddress,
    cdpOwnerAddress: trader.cdpOwnerAddress,
    cdpAccountName: trader.cdpAccountName,
    tokenId: trader.tokenId,
    tbaAddress: trader.tbaAddress,
    mintTxHash: trader.mintTxHash,
    transferTxHash: trader.transferTxHash,
    imageStatus: trader.imageStatus,
    profileImageUrl: await resolveTraderProfileImageUrl(ctx, trader),
    traits: readPublicTraits(trader.imagePromptSource),
    rarity: humanizeRarity(trader.imageVariant),
    createdAt: trader.createdAt,
    updatedAt: trader.updatedAt,
  };
}

/** Read the stored seed-only demographic ({skin,gender,age}) from imagePromptSource. */
function readStoredDemographic(
  source: unknown
): { skin: string; gender: string; age: string } | null {
  if (
    typeof source !== "object" ||
    source === null ||
    !("demographic" in source)
  ) {
    return null;
  }
  const d = (source as { demographic: unknown }).demographic;
  if (typeof d !== "object" || d === null) return null;
  const { skin, gender, age } = d as Record<string, unknown>;
  if (
    typeof skin !== "string" ||
    typeof gender !== "string" ||
    typeof age !== "string"
  ) {
    return null;
  }
  return { skin, gender, age };
}

/**
 * v4 stores the overall mint rarity tier in `imageVariant` (v3 stored an
 * archetype id). Surface it as the trader's headline "Rarity".
 */
function humanizeRarity(variant: string | undefined): string {
  return variant && variant.trim() !== "" ? variant : "Common";
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
    rarity: humanizeRarity(trader.imageVariant),
    riskProfile: deriveRiskProfile(trader.mandate),
    tokenId: trader.tokenId ?? null,
    profileImageUrl: await resolveReadyProfileImageUrl(ctx, trader),
    traits: readPublicTraits(trader.imagePromptSource),
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
    const dm = await ctx.db.get(trader.deskManagerId);
    const isAgentDesk = isMcpSubject(dm?.subject);
    const publicTier = await resolvePublicTraderTier(ctx, traderId);
    return {
      ...basics,
      escrowBalanceUsdc: trader.escrowBalanceUsdc ?? 0,
      ownerAddress: dm?.walletAddress ?? null,
      isAgentDesk,
      /** Public floor credential only — never staker/pending/unlock. */
      effectiveTier: publicTier.effectiveTier,
      seatSyncStatus: publicTier.syncStatus,
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

export type MandatePatch = Partial<
  Pick<Doc<"traders">, "mandate" | "personality" | "updatedAt">
>;

/**
 * Coerce a mandate value into a plain object. MCP clients can serialize the
 * `v.any()` mandate arg as a JSON string; without this it gets stored verbatim
 * and later exploded into character-indexed keys by the object spread in
 * `buildMandatePatch`. Returns {} for empty/missing input; throws on garbage.
 */
export function normalizeMandate(mandate: unknown): Record<string, unknown> {
  if (mandate === null || mandate === undefined) return {};
  let value = mandate;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return {};
    try {
      value = JSON.parse(trimmed);
    } catch {
      throw new Error("mandate string is not valid JSON");
    }
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("mandate must be an object");
  }
  return value as Record<string, unknown>;
}

/**
 * Validates mandate fields and builds a patch for mandate/personality updates.
 * Shared by browser `updateMandate` and MCP `updateMandateForMcp`.
 */
export function buildMandatePatch(
  trader: Doc<"traders">,
  mandate: unknown,
  personality: string | null | undefined
): MandatePatch {
  const normalizedMandate = normalizeMandate(mandate);

  const cleaned: Record<string, unknown> = {};

  for (const key of MANDATE_NUMERIC_KEYS) {
    if (!(key in normalizedMandate)) continue;
    const val = normalizedMandate[key];
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

  if ("keywords" in normalizedMandate) {
    const val = normalizedMandate.keywords;
    if (
      !Array.isArray(val) ||
      !val.every((entry) => typeof entry === "string")
    ) {
      throw new Error("keywords must be an array of strings");
    }
    cleaned.keywords = val;
  }

  if ("llm_deal_selection" in normalizedMandate) {
    const val = normalizedMandate.llm_deal_selection;
    if (typeof val !== "boolean") {
      throw new Error("llm_deal_selection must be a boolean");
    }
    cleaned.llm_deal_selection = val;
  }

  const existingMandate = normalizeMandate(trader.mandate);

  const patch: MandatePatch = {
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

  return patch;
}

/** Assert trader belongs to the given desk (MCP + internal callers). */
export function assertTraderOwnedByDesk(
  trader: Doc<"traders"> | null,
  deskManagerId: Id<"deskManagers">
): asserts trader is Doc<"traders"> {
  if (!trader || trader.deskManagerId !== deskManagerId) {
    throw new Error("Forbidden");
  }
}

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

    const patch = buildMandatePatch(trader, mandate, personality);
    await ctx.db.patch(traderId, patch);
    return { ok: true as const };
  },
});

/** Internal (MCP): update mandate + personality for a desk-owned trader. */
export const updateMandateForMcp = internalMutation({
  args: {
    deskManagerId: v.id("deskManagers"),
    traderId: v.id("traders"),
    mandate: v.any(),
    personality: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { deskManagerId, traderId, mandate, personality }) => {
    const trader = await ctx.db.get(traderId);
    assertTraderOwnedByDesk(trader, deskManagerId);
    const patch = buildMandatePatch(trader, mandate, personality);
    await ctx.db.patch(traderId, patch);
    return { ok: true as const, traderName: trader.name };
  },
});

/** Shared activation guards for resume/setStatus active transitions. */
export function assertCanActivateTrader(
  trader: Doc<"traders">,
  nowMs: number
): void {
  if (trader.status === "wiped_out") {
    throw new Error("Cannot activate a wiped out trader");
  }
  if (trader.walletStatus !== "ready") {
    throw new Error("Trader wallet must be ready before activation");
  }
  if ((trader.escrowBalanceUsdc ?? 0) <= 0) {
    throw new Error("Fund trader before activating");
  }
  assertTradingHours(nowMs, "(cannot activate trader)");
}

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
      assertCanActivateTrader(trader, Date.now());
    }

    await ctx.db.patch(traderId, { status, updatedAt: Date.now() });
    return { ok: true as const };
  },
});

/** Internal (MCP): set trader status for a desk-owned trader. */
export const setStatusForMcp = internalMutation({
  args: {
    deskManagerId: v.id("deskManagers"),
    traderId: v.id("traders"),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("wiped_out")
    ),
    now: v.number(),
  },
  handler: async (ctx, { deskManagerId, traderId, status, now }) => {
    const trader = await ctx.db.get(traderId);
    assertTraderOwnedByDesk(trader, deskManagerId);

    if (status === "active") {
      assertCanActivateTrader(trader, now);
    }

    await ctx.db.patch(traderId, { status, updatedAt: now });
    return { ok: true as const, traderName: trader.name, status };
  },
});

/**
 * Internal: insert trader row + schedule portrait. Wallet provisioning is
 * owned by callers (browser `create` schedules; MCP action awaits).
 * Idempotent on (ownerSubject, name).
 */
export const createRecord = internalMutation({
  args: {
    deskManagerId: v.id("deskManagers"),
    ownerSubject: v.string(),
    name: v.string(),
    mandate: v.optional(v.any()),
    personality: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const trimmedName = args.name.trim();
    const normalizedName = trimmedName.toLowerCase();
    if (!TRADER_NAME_REGEX.test(trimmedName)) {
      throw new Error("Invalid trader name");
    }

    const { ownerSubject, deskManagerId } = args;

    // Idempotency (owner + exact name): preserve existing behavior for retries.
    const dupeByOwnerAndName = await ctx.db
      .query("traders")
      .withIndex("byOwnerAndName", (q) =>
        q.eq("ownerSubject", ownerSubject).eq("name", trimmedName)
      )
      .unique();

    if (dupeByOwnerAndName) {
      return dupeByOwnerAndName._id;
    }

    const conflict = await findTraderNameConflict(
      ctx,
      trimmedName,
      normalizedName
    );
    if (conflict) {
      if (conflict.ownerSubject === ownerSubject) {
        return conflict._id;
      }
      throw new Error(TRADER_NAME_TAKEN_MESSAGE);
    }

    const now = Date.now();
    const normalizedMandate = normalizeMandate(args.mandate);
    // Mint the immutable per-trader portrait seed once. All traits derive from
    // it deterministically and it is never regenerated (determinism inviolable).
    const seed = crypto.randomUUID();
    const portraitFields = buildPortraitSeed({
      seed,
      name: trimmedName,
      mandate: normalizedMandate,
      personality: args.personality,
    });
    const traderId = await ctx.db.insert("traders", {
      deskManagerId,
      ownerSubject,
      name: trimmedName,
      nameLower: normalizedName,
      status: "paused",
      mandate: normalizedMandate,
      personality: args.personality,
      portraitSeed: seed,
      ...portraitFields,
      walletStatus: "pending",
      escrowBalanceUsdc: 0,
      createdAt: now,
      updatedAt: now,
    });

    if (!skipWalletSchedule()) {
      await ctx.scheduler.runAfter(0, internal.portraits.generateForTrader, {
        traderId,
      });
    }

    return traderId;
  },
});

/** Public: create a trader, schedule wallet creation. Idempotent on (ownerSubject, name). */
export const create = mutation({
  args: {
    name: v.string(),
    mandate: v.optional(v.any()),
    personality: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"traders">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const existing = await ctx.db
      .query("deskManagers")
      .withIndex("bySubject", (q) => q.eq("subject", identity.subject))
      .unique();
    if (!existing)
      throw new Error("Desk manager not found — call upsertMe first");
    if ((existing.walletBalanceUsdc ?? 0) <= 0) {
      throw new Error("Fund your wallet before hiring a trader");
    }

    const traderId: Id<"traders"> = await ctx.runMutation(
      internal.traders.createRecord,
      {
        deskManagerId: existing._id,
        ownerSubject: identity.subject,
        name: args.name,
        mandate: args.mandate,
        personality: args.personality,
      }
    );
    await scheduleWalletForTrader(ctx, traderId);
    return traderId;
  },
});

/** Public: retry wallet provisioning for an owned trader. */
export const retryWalletProvisioning = mutation({
  args: { traderId: v.id("traders") },
  handler: async (ctx, { traderId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const trader = await ctx.db.get(traderId);
    if (!trader || trader.ownerSubject !== identity.subject) {
      throw new Error("Forbidden");
    }

    if (trader.walletStatus === "ready" && trader.tokenId) {
      return { ok: true as const, status: "ready" as const };
    }

    // Don't churn updatedAt or stack scheduler tasks if a run is already in
    // flight — wallet.createForTrader's lease will time it out if it's wedged.
    if (trader.walletStatus === "creating") {
      return { ok: true as const, status: "in_progress" as const };
    }

    await ctx.db.patch(traderId, {
      walletStatus: "pending",
      walletError: undefined,
      walletStep: undefined,
      walletStepTokenId: undefined,
      updatedAt: Date.now(),
    });

    if (!skipWalletSchedule()) {
      await ctx.scheduler.runAfter(0, internal.wallet.createForTrader, {
        traderId,
      });
    }

    return { ok: true as const, status: "scheduled" as const };
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

/**
 * Internal: CAS transition walletStatus pending|creating → creating.
 * Used by wallet.createForTrader to prevent concurrent provisioning workers
 * from racing and producing nonce collisions.
 */
export const markCreating = internalMutation({
  args: {
    traderId: v.id("traders"),
    expectedUpdatedAt: v.number(),
  },
  handler: async (ctx, { traderId, expectedUpdatedAt }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) return false;
    if (
      trader.walletStatus !== "pending" &&
      trader.walletStatus !== "creating"
    ) {
      return false;
    }
    if (trader.updatedAt !== expectedUpdatedAt) return false;

    await ctx.db.patch(traderId, {
      walletStatus: "creating",
      walletStep: "paperwork",
      walletStepTokenId: undefined,
      updatedAt: Math.max(Date.now(), trader.updatedAt + 1),
    });
    return true;
  },
});

/**
 * Internal: record a wallet-provisioning checkpoint (cosmetic; drives the
 * onboarding checklist). No-op unless a provisioning run is in flight, so a
 * stale worker can't scribble over a ready/error trader. Bumping updatedAt
 * also refreshes the createForTrader re-entry lease while progress is live.
 */
export const setWalletStep = internalMutation({
  args: {
    traderId: v.id("traders"),
    step: walletStepValidator,
    tokenId: v.optional(v.number()),
  },
  handler: async (ctx, { traderId, step, tokenId }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader || trader.walletStatus !== "creating") return;
    await ctx.db.patch(traderId, {
      walletStep: step,
      ...(tokenId !== undefined ? { walletStepTokenId: tokenId } : {}),
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
    mintTxHash: v.optional(v.string()),
    transferTxHash: v.optional(v.string()),
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
      mintTxHash: walletMeta.mintTxHash,
      transferTxHash: walletMeta.transferTxHash,
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

    const promptVersion = getPortraitPromptVersion(trader.imagePromptSource);
    // The portrait seed is minted once and never regenerated. Legacy rows (pre-v4)
    // lack it — mint one now and persist it so derivation is stable from here on.
    const seed = trader.portraitSeed ?? crypto.randomUUID();
    const stale =
      !trader.imagePrompt ||
      !trader.imageStyleSeed ||
      promptVersion < PORTRAIT_METADATA_VERSION;

    // Determinism is inviolable: if this row already has derived traits, a version
    // bump may only evolve the prompt TEXT — never re-roll trait identity. Recompute
    // the prompt from the stored trait + demographic ids and keep the traits as-is.
    // Only re-derive from the seed when traits are absent (legacy / first generation).
    const storedTraits = readPublicTraits(trader.imagePromptSource);
    const storedDemographic = readStoredDemographic(trader.imagePromptSource);

    let seedPatch: Record<string, unknown> = {};
    let reseeded = false;
    if (stale) {
      reseeded = true;
      if (storedTraits && storedDemographic) {
        const imagePrompt = composePromptFromStored(
          storedTraits,
          storedDemographic
        );
        const tier = resolveTierFromTraitIds(storedTraits);
        const prevSource =
          (trader.imagePromptSource as Record<string, unknown> | undefined) ??
          {};
        seedPatch = {
          imagePrompt,
          imageStyleSeed: `portrait-v${PORTRAIT_METADATA_VERSION}-${stableHash(seed).toString(36)}`,
          imageVariant: tier,
          metadataVersion: PORTRAIT_METADATA_VERSION,
          imagePromptSource: {
            ...prevSource,
            version: PORTRAIT_METADATA_VERSION,
            seed,
            tier,
          },
        };
      } else {
        seedPatch = buildPortraitSeed({
          seed,
          name: trader.name,
          mandate: trader.mandate ?? {},
          personality: trader.personality,
        });
      }
    }
    const nextRetryCount = reseeded ? 0 : (trader.imageRetryCount ?? 0) + 1;
    const patch = {
      ...seedPatch,
      portraitSeed: seed,
      imageStatus: "generating",
      imageLastAttemptAt: Date.now(),
      imageRetryCount: nextRetryCount,
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
    /** Outcome document id — idempotency key via dealOutcomes.balanceAppliedAt. */
    outcomeId: v.id("dealOutcomes"),
  },
  handler: async (ctx, { traderId, pnlUsdc, outcomeId }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) return null;

    const outcome = await ctx.db.get(outcomeId);
    if (!outcome) return null;

    // Idempotency: per-outcome, not global lastOutcomeId
    if (outcome.balanceAppliedAt !== undefined) {
      return {
        escrowBalanceUsdc: trader.escrowBalanceUsdc ?? 0,
        wipedOut: trader.status === "wiped_out",
      };
    }

    const currentBalance = trader.escrowBalanceUsdc ?? 0;
    const newBalance = Math.max(0, currentBalance + pnlUsdc);
    const wipedOut = newBalance <= 0;
    const firstWipeout = wipedOut && trader.status !== "wiped_out";

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
    await ctx.db.patch(outcomeId, { balanceAppliedAt: Date.now() });

    if (firstWipeout) {
      await queueWipeoutEmailIfNeeded(ctx, traderId, trader.deskManagerId);
    }

    return { escrowBalanceUsdc: newBalance, wipedOut };
  },
});

async function queueWipeoutEmailIfNeeded(
  ctx: MutationCtx,
  traderId: Id<"traders">,
  deskManagerId: Id<"deskManagers">
) {
  const existingNotification = await ctx.db
    .query("emailNotifications")
    .withIndex("byTraderAndType", (q) =>
      q.eq("traderId", traderId).eq("type", "trader_wipeout")
    )
    .unique();

  if (!existingNotification) {
    const deskManager = await ctx.db.get(deskManagerId);
    const toEmail = normalizeEmail(deskManager?.email);
    const now = Date.now();
    const notificationId = await ctx.db.insert("emailNotifications", {
      type: "trader_wipeout",
      traderId,
      deskManagerId,
      toEmail,
      status: toEmail ? "pending" : "skipped",
      reason: toEmail ? undefined : "missing_email",
      createdAt: now,
      updatedAt: now,
    });

    if (toEmail) {
      await ctx.scheduler.runAfter(0, internal.emails.sendWipeoutEmail, {
        notificationId,
      });
    }
  }
}

/**
 * Internal: overwrite escrowBalanceUsdc from a fresh on-chain read.
 *
 * Does NOT transition trader status. Chain balance can legitimately reach 0
 * via withdraw or mid-deal (between enterDeal debit and resolveEntry credit);
 * wipeout is only set from a verified loss outcome in `applyOutcomeBalance`.
 */
export const syncEscrowBalance = internalMutation({
  args: { traderId: v.id("traders"), balanceUsdc: v.number() },
  handler: async (ctx, { traderId, balanceUsdc }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) return;
    if ((trader.escrowBalanceUsdc ?? 0) === balanceUsdc) {
      return;
    }
    await ctx.db.patch(traderId, {
      escrowBalanceUsdc: balanceUsdc,
      updatedAt: Date.now(),
    });
  },
});

/** Internal ops: rename trader with the same validation and uniqueness rules as create. */
export const renameInternalForOps = internalMutation({
  args: {
    traderId: v.id("traders"),
    name: v.string(),
  },
  handler: async (ctx, { traderId, name }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) throw new Error("Trader not found");

    const trimmedName = name.trim();
    const normalizedName = trimmedName.toLowerCase();
    if (!TRADER_NAME_REGEX.test(trimmedName)) {
      throw new Error("Invalid trader name");
    }

    if (trader.name === trimmedName) {
      if (trader.nameLower !== normalizedName) {
        await ctx.db.patch(traderId, {
          nameLower: normalizedName,
          updatedAt: Date.now(),
        });
      }
      return { ok: true as const, traderId };
    }

    const conflict = await findTraderNameConflict(
      ctx,
      trimmedName,
      normalizedName,
      traderId
    );
    if (conflict) {
      throw new Error(TRADER_NAME_TAKEN_MESSAGE);
    }

    await ctx.db.patch(traderId, {
      name: trimmedName,
      nameLower: normalizedName,
      updatedAt: Date.now(),
    });
    return { ok: true as const, traderId };
  },
});

/**
 * Internal (ops): wholesale-replace a trader's mandate with a clean object.
 * Unlike updateMandateForMcp this does NOT merge — use it to scrub a mandate
 * that was corrupted by the historical string-spread bug (stray "0","1",… keys).
 */
export const setMandateInternalForOps = internalMutation({
  args: {
    traderId: v.id("traders"),
    mandate: v.any(),
  },
  handler: async (ctx, { traderId, mandate }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) throw new Error("Trader not found");
    await ctx.db.patch(traderId, {
      mandate: normalizeMandate(mandate),
      updatedAt: Date.now(),
    });
    return { ok: true as const, traderId };
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
    return traders.filter((t) => t._id !== excludeTraderId).map((t) => t._id);
  },
});
