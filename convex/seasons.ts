import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { wireSeason } from "./seeds/wireSeason01";
import { upsertRegistryCompanies } from "./wire/registrySync";

/**
 * Idempotent season importer. Run via: npx convex run seasons:importSeason
 *
 * Seeds/updates the active wire season (tone, style rules, forbidden language,
 * weekly shape) and syncs the company roster from tokens.json. No fictional
 * entities or arcs — arcs spawn from real price/player streaks at run time.
 */
export const importSeason = internalMutation({
  args: {},
  returns: v.object({
    seasonId: v.id("narrativeSeasons"),
    companiesSynced: v.number(),
    companiesRemoved: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();

    let seasonId: Id<"narrativeSeasons">;
    const existingSeason = await ctx.db
      .query("narrativeSeasons")
      .withIndex("bySeasonKey", (q) => q.eq("seasonKey", wireSeason.seasonKey))
      .unique();

    if (existingSeason) {
      await ctx.db.patch(existingSeason._id, {
        title: wireSeason.title,
        tone: wireSeason.tone,
        weeklyShape: wireSeason.weeklyShape,
        styleRules: wireSeason.styleRules,
        forbiddenLanguage: wireSeason.forbiddenLanguage,
        isActive: true,
        updatedAt: now,
      });
      seasonId = existingSeason._id;
    } else {
      seasonId = await ctx.db.insert("narrativeSeasons", {
        seasonKey: wireSeason.seasonKey,
        title: wireSeason.title,
        weekStartAt: wireSeason.weekRange.start,
        weekEndAt: wireSeason.weekRange.end,
        tone: wireSeason.tone,
        weeklyShape: wireSeason.weeklyShape,
        styleRules: wireSeason.styleRules,
        forbiddenLanguage: wireSeason.forbiddenLanguage,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Deactivate any other active seasons.
    const activeSeasons = await ctx.db
      .query("narrativeSeasons")
      .withIndex("byIsActive", (q) => q.eq("isActive", true))
      .take(10);
    for (const s of activeSeasons) {
      if (s._id !== seasonId) {
        await ctx.db.patch(s._id, { isActive: false, updatedAt: now });
      }
    }

    // Sync the company roster from tokens.json.
    const { synced, removed } = await upsertRegistryCompanies(ctx, seasonId);

    return { seasonId, companiesSynced: synced, companiesRemoved: removed };
  },
});

/** Test helper: list all entities for idempotency assertions. */
export const listEntitiesForTest = internalQuery({
  args: {},
  handler: async (ctx) => ctx.db.query("narrativeEntities").take(100),
});
