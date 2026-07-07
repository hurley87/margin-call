import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

const arcStageValidator = v.union(
  v.literal("noticed"),
  v.literal("talked_about"),
  v.literal("frenzy"),
  v.literal("peak"),
  v.literal("aftermath"),
  v.literal("retired")
);

const subjectValidator = v.object({
  type: v.union(v.literal("trader"), v.literal("deal"), v.literal("manager")),
  id: v.string(),
});

/**
 * Idempotent epoch writer. All numbers, stages, and arcs are computed by code
 * (worldState.ts) and handed in here — this mutation only persists them:
 *
 *   - inserts the marketNarratives drop (+ tweet variant + source trace)
 *   - patches each arc's stage / tension / lastBeatDayKey (retires when done)
 *   - inserts freshly spawned arcs (company or desk streaks)
 *
 * Re-checks byEpochSlot inside the transaction; returns { inserted: false } if
 * the slot was already written.
 */
export const persistGeneratedEpoch = internalMutation({
  args: {
    seasonId: v.id("narrativeSeasons"),
    epochSlot: v.number(),
    dropTitle: v.string(),
    topArcTitle: v.string(),
    topArcTension: v.number(),
    topArcStage: v.optional(arcStageValidator),
    dispatches: v.array(v.any()),
    worldState: v.any(),
    confirmedFacts: v.optional(v.array(v.string())),
    openQuestions: v.optional(v.array(v.string())),
    subjects: v.optional(v.array(subjectValidator)),
    isFlash: v.optional(v.boolean()),
    signal: v.optional(v.union(v.string(), v.null())),
    tweetVariant: v.optional(v.string()),
    tweetStatus: v.optional(v.string()),
    tweetSubjectHandle: v.optional(v.union(v.string(), v.null())),
    sourceTrace: v.optional(v.any()),
    arcRefs: v.array(v.id("narrativeArcs")),
    arcAdvances: v.array(
      v.object({
        arcSlug: v.string(),
        toStage: arcStageValidator,
        newTensionScore: v.number(),
        peakFiringNow: v.boolean(),
        retiring: v.boolean(),
        newLastBeatDayKey: v.union(v.string(), v.null()),
      })
    ),
    spawnRequests: v.array(
      v.object({
        slug: v.string(),
        title: v.string(),
        summary: v.string(),
        subjectType: v.union(v.literal("company"), v.literal("desk")),
        subjectSlug: v.string(),
        entitySlug: v.union(v.string(), v.null()),
        arcStage: arcStageValidator,
        tensionScore: v.number(),
      })
    ),
    eventsIngested: v.optional(v.any()),
    rawNarrative: v.string(),
  },
  handler: async (ctx, args) => {
    const {
      seasonId,
      epochSlot,
      dropTitle,
      topArcTitle,
      topArcTension,
      topArcStage,
      dispatches,
      worldState,
      confirmedFacts,
      openQuestions,
      subjects,
      isFlash,
      signal,
      tweetVariant,
      tweetStatus,
      tweetSubjectHandle,
      sourceTrace,
      arcRefs,
      arcAdvances,
      spawnRequests,
      eventsIngested,
      rawNarrative,
    } = args;

    // Idempotency: bail if this slot was already written.
    const existing = await ctx.db
      .query("marketNarratives")
      .withIndex("byEpochSlot", (q) => q.eq("epochSlot", epochSlot))
      .first();
    if (existing) {
      return { inserted: false as const, dropId: existing._id };
    }

    const now = Date.now();

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
      subjects,
      arcStage: topArcStage,
      isFlash,
      signal: signal ?? undefined,
      tweetVariant,
      tweetStatus,
      tweetSubjectHandle: tweetSubjectHandle ?? undefined,
      sourceTrace: sourceTrace ?? undefined,
      eventsIngested: eventsIngested ?? null,
      rawNarrative,
      createdAt: now,
    });

    // ── Arc stage / tension / lastBeat (code-decided) ──
    for (const adv of arcAdvances) {
      const arc = await ctx.db
        .query("narrativeArcs")
        .withIndex("bySeasonAndSlug", (q) =>
          q.eq("seasonId", seasonId).eq("slug", adv.arcSlug)
        )
        .unique();
      if (!arc) continue;
      await ctx.db.patch(arc._id, {
        arcStage: adv.toStage,
        tensionScore: adv.newTensionScore,
        ...(adv.peakFiringNow ? { climaxFired: true } : {}),
        ...(adv.newLastBeatDayKey
          ? { lastBeatDayKey: adv.newLastBeatDayKey }
          : {}),
        ...(adv.retiring ? { status: "resolved" as const } : {}),
        lastTouchedAt: now,
        updatedAt: now,
      });
    }

    // ── Spawn fresh arcs (company / desk streaks) ──
    for (const spec of spawnRequests) {
      let entityRefs: Id<"narrativeEntities">[] = [];
      if (spec.entitySlug) {
        const entity = await ctx.db
          .query("narrativeEntities")
          .withIndex("bySeasonAndSlug", (q) =>
            q.eq("seasonId", seasonId).eq("slug", spec.entitySlug!)
          )
          .unique();
        if (entity) entityRefs = [entity._id];
      }
      await ctx.db.insert("narrativeArcs", {
        seasonId,
        slug: spec.slug,
        title: spec.title,
        summary: spec.summary,
        status: "active" as const,
        tensionScore: spec.tensionScore,
        arcStage: spec.arcStage,
        beatsPublishedByStage: {},
        climaxFired: spec.arcStage === "peak",
        primaryFirmSlug: spec.subjectSlug,
        lastBeatDayKey: undefined,
        entityRefs,
        lastTouchedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { inserted: true as const, dropId, epoch };
  },
});
