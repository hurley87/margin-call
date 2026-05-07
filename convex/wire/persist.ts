import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Idempotent epoch writer.
 *
 * Re-checks byEpochSlot inside the transaction; if a row already exists for
 * this slot, returns { inserted: false } without touching any data.
 * Otherwise writes the marketNarratives row, applies arc tension updates,
 * and returns { inserted: true, dropId, epoch }.
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
    arcRefs: v.array(v.id("narrativeArcs")),
    arcUpdates: v.array(
      v.object({ arcId: v.id("narrativeArcs"), tensionDelta: v.number() })
    ),
    eventsIngested: v.optional(v.any()),
    rawNarrative: v.string(),
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
      arcRefs,
      arcUpdates,
      eventsIngested,
      rawNarrative,
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
      eventsIngested: eventsIngested ?? null,
      rawNarrative,
      createdAt: now,
    });

    // Apply arc tension updates (clamped 0–10)
    for (const { arcId, tensionDelta } of arcUpdates) {
      const arc = await ctx.db.get(arcId);
      if (!arc) continue;
      const newTension = Math.min(
        10,
        Math.max(0, arc.tensionScore + tensionDelta)
      );
      await ctx.db.patch(arcId, {
        tensionScore: newTension,
        lastTouchedAt: now,
        updatedAt: now,
      });
    }

    return { inserted: true as const, dropId, epoch };
  },
});
