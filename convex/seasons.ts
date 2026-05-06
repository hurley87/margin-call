import { internalQuery, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { season01 } from "./seeds/wireSeason01";

/** Idempotent season importer. Run via: npx convex run seasons:importSeason */
export const importSeason = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    let seasonId: Id<"narrativeSeasons">;
    const existingSeason = await ctx.db
      .query("narrativeSeasons")
      .withIndex("bySeasonKey", (q) => q.eq("seasonKey", season01.seasonKey))
      .unique();

    if (existingSeason) {
      await ctx.db.patch(existingSeason._id, {
        title: season01.title,
        tone: season01.tone,
        weeklyShape: season01.weeklyShape,
        styleRules: season01.styleRules,
        forbiddenLanguage: season01.forbiddenLanguage,
        updatedAt: now,
      });
      seasonId = existingSeason._id;
    } else {
      seasonId = await ctx.db.insert("narrativeSeasons", {
        seasonKey: season01.seasonKey,
        title: season01.title,
        weekStartAt: season01.weekRange.start,
        weekEndAt: season01.weekRange.end,
        tone: season01.tone,
        weeklyShape: season01.weeklyShape,
        styleRules: season01.styleRules,
        forbiddenLanguage: season01.forbiddenLanguage,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Deactivate any other active seasons; reactivate this one if it was inactive
    const activeSeasons = await ctx.db
      .query("narrativeSeasons")
      .withIndex("byIsActive", (q) => q.eq("isActive", true))
      .take(10);
    for (const s of activeSeasons) {
      if (s._id !== seasonId) {
        await ctx.db.patch(s._id, { isActive: false, updatedAt: now });
      }
    }
    if (existingSeason && !existingSeason.isActive) {
      await ctx.db.patch(seasonId, { isActive: true, updatedAt: now });
    }

    let entitiesUpserted = 0;
    const entitySlugToId: Record<string, Id<"narrativeEntities">> = {};

    for (const entity of season01.entities) {
      const existing = await ctx.db
        .query("narrativeEntities")
        .withIndex("bySeasonAndSlug", (q) =>
          q.eq("seasonId", seasonId).eq("slug", entity.slug)
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          displayName: entity.displayName,
          kind: entity.kind,
          aliases: entity.aliases,
          bio: entity.bio,
          traits: entity.traits,
        });
        entitySlugToId[entity.slug] = existing._id;
      } else {
        const id = await ctx.db.insert("narrativeEntities", {
          seasonId,
          slug: entity.slug,
          kind: entity.kind,
          displayName: entity.displayName,
          aliases: entity.aliases,
          bio: entity.bio,
          traits: entity.traits,
          createdAt: now,
        });
        entitySlugToId[entity.slug] = id;
        entitiesUpserted++;
      }
    }

    let arcsUpserted = 0;
    const arcSlugToId: Record<string, Id<"narrativeArcs">> = {};

    for (const arc of season01.arcs) {
      const entityRefs = arc.entitySlugs
        .map((slug) => entitySlugToId[slug])
        .filter((id): id is Id<"narrativeEntities"> => id != null);

      const existing = await ctx.db
        .query("narrativeArcs")
        .withIndex("bySeasonAndSlug", (q) =>
          q.eq("seasonId", seasonId).eq("slug", arc.slug)
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          title: arc.title,
          summary: arc.summary,
          tensionScore: arc.tensionScore,
          entityRefs,
          status: arc.status,
          updatedAt: now,
        });
        arcSlugToId[arc.slug] = existing._id;
      } else {
        const id = await ctx.db.insert("narrativeArcs", {
          seasonId,
          slug: arc.slug,
          title: arc.title,
          summary: arc.summary,
          status: arc.status,
          tensionScore: arc.tensionScore,
          entityRefs,
          lastTouchedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        arcSlugToId[arc.slug] = id;
        arcsUpserted++;
      }
    }

    let dropInserted = false;
    const existingDrop = await ctx.db
      .query("marketNarratives")
      .withIndex("byEpochSlot", (q) => q.eq("epochSlot", 0))
      .first();

    if (!existingDrop) {
      const lastEpoch = await ctx.db
        .query("marketNarratives")
        .withIndex("byEpoch")
        .order("desc")
        .first();
      const nextEpoch = (lastEpoch?.epoch ?? 0) + 1;

      const { initialDrop } = season01;
      const referencedArcSlugs = [
        ...new Set(initialDrop.dispatches.map((d) => d.arcSlug)),
      ];
      const arcRefs = referencedArcSlugs
        .map((slug) => arcSlugToId[slug])
        .filter((id): id is Id<"narrativeArcs"> => id != null);

      const topArc = season01.arcs.reduce((a, b) =>
        a.tensionScore >= b.tensionScore ? a : b
      );

      await ctx.db.insert("marketNarratives", {
        epoch: nextEpoch,
        seasonId,
        arcRefs,
        epochSlot: 0,
        dropTitle: initialDrop.dropTitle,
        topArcTitle: topArc.title,
        topArcTension: topArc.tensionScore,
        headlines: initialDrop.dispatches,
        worldState: initialDrop.worldState,
        rawNarrative: initialDrop.dispatches.map((d) => d.headline).join(" | "),
        createdAt: now,
      });
      dropInserted = true;
    }

    return { seasonId, entitiesUpserted, arcsUpserted, dropInserted };
  },
});

/** Test helper: list all entities for idempotency assertions. */
export const listEntitiesForTest = internalQuery({
  args: {},
  handler: async (ctx) => ctx.db.query("narrativeEntities").take(100),
});
