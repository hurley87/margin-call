import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { STAGE_TARGET_TENSION } from "./stages";

const arcStageValidator = v.union(
  v.literal("rumor"),
  v.literal("denial"),
  v.literal("confirmation"),
  v.literal("escalation"),
  v.literal("climax"),
  v.literal("aftermath"),
  v.literal("retired")
);

const firmStatusValidator = v.union(
  v.literal("healthy"),
  v.literal("stressed"),
  v.literal("collapsing"),
  v.literal("dead")
);

const subjectValidator = v.object({
  type: v.union(v.literal("trader"), v.literal("deal"), v.literal("manager")),
  id: v.string(),
});

/**
 * Idempotent epoch writer. All numbers, stages, and statuses are computed by
 * code (worldState.ts) and handed in here — this mutation only persists them:
 *
 *   - inserts the marketNarratives drop (with code-attached subjects/flash/etc.)
 *   - patches each firm entity's running loss + status + notable facts
 *   - patches each arc's stage / tension / beats / climaxFired (retires when done)
 *   - inserts freshly spawned firm + character entities and their new arc
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
    arcRefs: v.array(v.id("narrativeArcs")),
    arcAdvances: v.array(
      v.object({
        arcSlug: v.string(),
        toStage: arcStageValidator,
        newTensionScore: v.number(),
        climaxFiringNow: v.boolean(),
        retiring: v.boolean(),
        newBeatsPublishedByStage: v.record(v.string(), v.number()),
        newLastBeatDayKey: v.union(v.string(), v.null()),
      })
    ),
    firmDeltas: v.array(
      v.object({
        firmSlug: v.string(),
        newRunningLossUsdc: v.number(),
        newStatus: firmStatusValidator,
        appendNotableFacts: v.array(v.string()),
        lastLossDayKey: v.string(),
      })
    ),
    spawnRequests: v.array(v.any()),
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
      arcRefs,
      arcAdvances,
      firmDeltas,
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
      eventsIngested: eventsIngested ?? null,
      rawNarrative,
      createdAt: now,
    });

    // ── Firm running-loss + status + facts (code-decided) ───────────────────
    for (const delta of firmDeltas) {
      const firm = await ctx.db
        .query("narrativeEntities")
        .withIndex("bySeasonAndSlug", (q) =>
          q.eq("seasonId", seasonId).eq("slug", delta.firmSlug)
        )
        .unique();
      if (!firm) continue;
      const notableFacts = [
        ...(firm.notableFacts ?? []),
        ...delta.appendNotableFacts,
      ];
      await ctx.db.patch(firm._id, {
        runningLossUsdc: delta.newRunningLossUsdc,
        status: delta.newStatus,
        notableFacts,
        lastLossDayKey: delta.lastLossDayKey,
      });
    }

    // ── Arc stage / tension / beats (code-decided) ──────────────────────────
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
        beatsPublishedByStage: adv.newBeatsPublishedByStage,
        ...(adv.climaxFiringNow ? { climaxFired: true } : {}),
        ...(adv.newLastBeatDayKey
          ? { lastBeatDayKey: adv.newLastBeatDayKey }
          : {}),
        ...(adv.retiring ? { status: "resolved" as const } : {}),
        lastTouchedAt: now,
        updatedAt: now,
      });
    }

    // ── Spawn fresh arcs + their entities ───────────────────────────────────
    for (const spec of spawnRequests as Array<{
      templateKey: string;
      slug: string;
      title: string;
      summary: string;
      firm: {
        slug: string;
        displayName: string;
        aliases: string[];
        bio: string;
        traits: string[];
      };
      character: {
        slug: string;
        displayName: string;
        aliases: string[];
        bio: string;
        traits: string[];
        kind: "trader" | "regulator" | "politician";
      };
    }>) {
      const entityRefs: Id<"narrativeEntities">[] = [];

      const firmId = await ctx.db.insert("narrativeEntities", {
        seasonId,
        slug: spec.firm.slug,
        kind: "firm" as const,
        displayName: spec.firm.displayName,
        aliases: spec.firm.aliases,
        bio: spec.firm.bio,
        traits: spec.firm.traits,
        status: "healthy" as const,
        runningLossUsdc: 0,
        notableFacts: [],
        oneOffEventsFired: [],
        createdAt: now,
      });
      entityRefs.push(firmId);

      const charId = await ctx.db.insert("narrativeEntities", {
        seasonId,
        slug: spec.character.slug,
        kind: spec.character.kind,
        displayName: spec.character.displayName,
        aliases: spec.character.aliases,
        bio: spec.character.bio,
        traits: spec.character.traits,
        createdAt: now,
      });
      entityRefs.push(charId);

      await ctx.db.insert("narrativeArcs", {
        seasonId,
        slug: spec.slug,
        title: spec.title,
        summary: spec.summary,
        status: "active" as const,
        tensionScore: STAGE_TARGET_TENSION.rumor,
        arcStage: "rumor" as const,
        beatsPublishedByStage: {},
        climaxFired: false,
        templateKey: spec.templateKey,
        primaryFirmSlug: spec.firm.slug,
        entityRefs,
        lastTouchedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { inserted: true as const, dropId, epoch };
  },
});
