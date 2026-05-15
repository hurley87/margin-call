import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

const phaseValidator = v.union(
  v.literal("rumor"),
  v.literal("crack"),
  v.literal("panic"),
  v.literal("rupture"),
  v.literal("fallout"),
  v.literal("countermove"),
  v.literal("resolution")
);

/**
 * Idempotent epoch writer.
 *
 * Re-checks byEpochSlot inside the transaction; if a row already exists for
 * this slot, returns { inserted: false } without touching any data.
 * Otherwise writes the marketNarratives row, applies arc tension updates,
 * inserts a wireDealSeeds row when a Deal Seed was emitted, and returns
 * { inserted: true, dropId, epoch }.
 */
export const persistGeneratedEpoch = internalMutation({
  args: {
    seasonId: v.id("narrativeSeasons"),
    epochSlot: v.number(),
    dropTitle: v.string(),
    topArcTitle: v.string(),
    topArcTension: v.number(),
    dispatches: v.array(v.any()),
    worldState: v.any(),
    confirmedFacts: v.optional(v.array(v.string())),
    openQuestions: v.optional(v.array(v.string())),
    arcRefs: v.array(v.id("narrativeArcs")),
    arcUpdates: v.array(
      v.object({
        arcId: v.id("narrativeArcs"),
        tensionDelta: v.number(),
        phase: v.optional(phaseValidator),
      })
    ),
    eventsIngested: v.optional(v.any()),
    rawNarrative: v.string(),
    /**
     * Optional Deal Seed payload. Generator pre-resolves arcSlug → arcId and the
     * source dispatch index; this mutation just inserts the row.
     */
    dealSeed: v.optional(
      v.object({
        arcId: v.id("narrativeArcs"),
        dispatchIndex: v.number(),
        dispatchKey: v.string(),
        dispatchHeadline: v.string(),
        prompt: v.string(),
        suggestedPotUsdc: v.number(),
        suggestedEntryCostUsdc: v.number(),
      })
    ),
  },
  handler: async (
    ctx,
    {
      seasonId,
      epochSlot,
      dropTitle,
      topArcTitle,
      topArcTension,
      dispatches,
      worldState,
      confirmedFacts,
      openQuestions,
      arcRefs,
      arcUpdates,
      eventsIngested,
      rawNarrative,
      dealSeed,
    }
  ) => {
    // Idempotency: bail if this slot was already written
    const existing = await ctx.db
      .query("marketNarratives")
      .withIndex("byEpochSlot", (q) => q.eq("epochSlot", epochSlot))
      .first();
    if (existing) {
      return { inserted: false as const, dropId: existing._id };
    }

    const now = Date.now();

    // Monotonic epoch number
    const lastDrop = await ctx.db
      .query("marketNarratives")
      .withIndex("byEpoch")
      .order("desc")
      .first();
    const epoch = (lastDrop?.epoch ?? 0) + 1;

    const dropId = await ctx.db.insert("marketNarratives", {
      epoch,
      seasonId,
      arcRefs,
      epochSlot,
      dropTitle,
      topArcTitle,
      topArcTension,
      headlines: dispatches,
      worldState,
      confirmedFacts,
      openQuestions,
      eventsIngested: eventsIngested ?? null,
      rawNarrative,
      createdAt: now,
    });

    // Apply arc tension updates (clamped 0–10)
    for (const { arcId, tensionDelta, phase } of arcUpdates) {
      const arc = await ctx.db.get(arcId);
      if (!arc) continue;
      const newTension = Math.min(
        10,
        Math.max(0, arc.tensionScore + tensionDelta)
      );
      await ctx.db.patch(arcId, {
        tensionScore: newTension,
        ...(phase ? { phase } : {}),
        lastTouchedAt: now,
        updatedAt: now,
      });
    }

    if (dealSeed) {
      await ctx.db.insert("wireDealSeeds", {
        epochId: dropId,
        seasonId,
        arcId: dealSeed.arcId,
        dispatchIndex: dealSeed.dispatchIndex,
        dispatchKey: dealSeed.dispatchKey,
        dispatchHeadline: dealSeed.dispatchHeadline,
        prompt: dealSeed.prompt,
        suggestedPotUsdc: dealSeed.suggestedPotUsdc,
        suggestedEntryCostUsdc: dealSeed.suggestedEntryCostUsdc,
        createdAt: now,
      });
    }

    return { inserted: true as const, dropId, epoch };
  },
});
