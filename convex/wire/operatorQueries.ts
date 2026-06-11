import { query } from "../_generated/server";
import { isOperatorSubject } from "./_operatorUtils";
import type { Id } from "../_generated/dataModel";

export const getOperatorContext = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const isOperator = identity != null && isOperatorSubject(identity.subject);
    const isDevEnv = process.env.NODE_ENV !== "production";

    if (!isOperator) {
      return {
        isOperator: false,
        isDevEnv,
        season: null,
        arcs: [],
        recentDropCount: 0,
        lastDrop: null,
      };
    }

    const season = await ctx.db
      .query("narrativeSeasons")
      .withIndex("byIsActive", (q) => q.eq("isActive", true))
      .first();

    if (!season) {
      return {
        isOperator: true,
        isDevEnv,
        season: null,
        arcs: [],
        recentDropCount: 0,
        lastDrop: null,
      };
    }

    const [arcs, lastDrop] = await Promise.all([
      ctx.db
        .query("narrativeArcs")
        .withIndex("bySeasonAndStatus", (q) =>
          q.eq("seasonId", season._id).eq("status", "active")
        )
        .take(50),
      ctx.db
        .query("marketNarratives")
        .withIndex("byEpoch")
        .order("desc")
        .first(),
    ]);

    // Collect all unique entity IDs across all arcs, fetch once, reassemble
    const allEntityIds = [
      ...new Set(
        arcs.flatMap((arc) => arc.entityRefs as Id<"narrativeEntities">[])
      ),
    ];
    const entityResults = await Promise.all(
      allEntityIds.map((id) => ctx.db.get(id))
    );
    const entityMap = new Map(
      entityResults
        .filter(Boolean)
        .map((e) => [
          e!._id as string,
          { slug: e!.slug, displayName: e!.displayName },
        ])
    );

    const arcsWithEntities = arcs.map((arc) => ({
      _id: arc._id,
      slug: arc.slug,
      title: arc.title,
      summary: arc.summary,
      tensionScore: arc.tensionScore,
      arcStage: arc.arcStage,
      lastTouchedAt: arc.lastTouchedAt,
      entities: arc.entityRefs
        .map((id) => entityMap.get(id as string))
        .filter(Boolean) as { slug: string; displayName: string }[],
    }));

    return {
      isOperator: true,
      isDevEnv,
      season: { title: season.title, seasonKey: season.seasonKey },
      arcs: arcsWithEntities.sort((a, b) => b.tensionScore - a.tensionScore),
      recentDropCount: lastDrop?.epoch ?? 0,
      lastDrop: lastDrop
        ? {
            epoch: lastDrop.epoch,
            dropTitle: lastDrop.dropTitle ?? null,
            createdAt: lastDrop.createdAt,
          }
        : null,
    };
  },
});
