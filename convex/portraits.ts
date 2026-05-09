import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const MAX_IMAGE_ATTEMPTS = 3;
const GENERATION_LEASE_MS = 10 * 60 * 1000;
const RETRY_DELAYS_MS = [30_000, 2 * 60_000];

/**
 * Internal: load only the prompt fields needed by the Node image action.
 * Raw prompt/source data never leaves Convex internals.
 */
export const loadGenerationInput = internalQuery({
  args: { traderId: v.id("traders") },
  handler: async (ctx, { traderId }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) return null;
    return {
      imageStatus: trader.imageStatus ?? "pending",
      imagePrompt: trader.imagePrompt,
      imagePromptSource: trader.imagePromptSource,
      imageStyleSeed: trader.imageStyleSeed,
      imageVariant: trader.imageVariant,
      imageRetryCount: trader.imageRetryCount ?? 0,
      imageLastAttemptAt: trader.imageLastAttemptAt,
      updatedAt: trader.updatedAt,
    };
  },
});

/**
 * Internal: atomically reserve a portrait generation attempt.
 * The retry count tracks failed attempts, so it is incremented only in
 * applyGenerationFailure.
 */
export const markGenerating = internalMutation({
  args: { traderId: v.id("traders") },
  handler: async (ctx, { traderId }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader) return { ok: false as const, reason: "missing" as const };
    if (trader.imageStatus === "ready") {
      return { ok: false as const, reason: "ready" as const };
    }

    const retryCount = trader.imageRetryCount ?? 0;
    if (retryCount >= MAX_IMAGE_ATTEMPTS) {
      await ctx.db.patch(traderId, {
        imageStatus: "error",
        updatedAt: Date.now(),
      });
      return { ok: false as const, reason: "max_attempts" as const };
    }

    const now = Date.now();
    const leaseActive =
      trader.imageStatus === "generating" &&
      trader.imageLastAttemptAt !== undefined &&
      now - trader.imageLastAttemptAt < GENERATION_LEASE_MS;
    if (leaseActive) {
      return { ok: false as const, reason: "in_flight" as const };
    }

    await ctx.db.patch(traderId, {
      imageStatus: "generating",
      imageLastAttemptAt: now,
      imageError: undefined,
      updatedAt: now,
    });
    return { ok: true as const };
  },
});

/** Internal: commit a stored portrait after Convex Storage succeeds. */
export const applyGeneratedImage = internalMutation({
  args: {
    traderId: v.id("traders"),
    profileImageStorageId: v.id("_storage"),
  },
  handler: async (ctx, { traderId, profileImageStorageId }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader || trader.imageStatus === "ready") return;
    await ctx.db.patch(traderId, {
      profileImageStorageId,
      imageStatus: "ready",
      imageError: undefined,
      updatedAt: Date.now(),
    });
  },
});

/** Internal: record a failed attempt without exposing raw errors publicly. */
export const applyGenerationFailure = internalMutation({
  args: { traderId: v.id("traders"), error: v.string() },
  handler: async (ctx, { traderId, error }) => {
    const trader = await ctx.db.get(traderId);
    if (!trader || trader.imageStatus === "ready") {
      return { shouldRetry: false as const, retryDelayMs: null };
    }

    const nextRetryCount = (trader.imageRetryCount ?? 0) + 1;
    const exhausted = nextRetryCount >= MAX_IMAGE_ATTEMPTS;
    await ctx.db.patch(traderId, {
      imageStatus: exhausted ? "error" : "pending",
      imageRetryCount: nextRetryCount,
      imageError: error,
      updatedAt: Date.now(),
    });

    return {
      shouldRetry: !exhausted,
      retryDelayMs: RETRY_DELAYS_MS[nextRetryCount - 1] ?? RETRY_DELAYS_MS[0],
    };
  },
});
