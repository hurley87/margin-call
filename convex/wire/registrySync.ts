/**
 * Reconciles the active season's company entities with `tokens.json`. Runs at
 * the top of every price-poll cycle so that adding / removing / editing an entry
 * in the registry takes effect on the next cycle with no code changes:
 *   - upserts one `narrativeEntities` (kind "company") row per registry entry
 *   - retires arcs of, and deletes, company entities no longer in the registry
 *
 * Company metadata (symbol, handle, address, house-token flag) is authoritative
 * from the registry; narrative continuity fields (notableFacts, etc.) persist.
 *
 * The core is exported as a plain helper so both this internalMutation and the
 * public `seasons:importSeason` mutation can run it inside their own transaction
 * (Convex mutations cannot call other mutations).
 */

import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { TOKEN_REGISTRY } from "./tokenRegistry";

export async function upsertRegistryCompanies(
  ctx: MutationCtx,
  seasonId: Id<"narrativeSeasons">
): Promise<{ synced: number; removed: number }> {
  const now = Date.now();
  const registrySlugs = new Set(TOKEN_REGISTRY.map((t) => t.slug));
  let synced = 0;

  for (const token of TOKEN_REGISTRY) {
    const existing = await ctx.db
      .query("narrativeEntities")
      .withIndex("bySeasonAndSlug", (q) =>
        q.eq("seasonId", seasonId).eq("slug", token.slug)
      )
      .unique();

    const bio =
      token.notes ??
      `${token.companyName} (${token.symbol}), a company listed on this exchange.`;
    const fields = {
      kind: "company" as const,
      displayName: token.companyName,
      aliases: [token.symbol, token.companyName],
      bio,
      traits: [] as string[],
      symbol: token.symbol,
      xHandle: token.xHandle,
      address: token.addressLc,
      isHouseToken: token.isHouseToken ?? false,
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("narrativeEntities", {
        seasonId,
        slug: token.slug,
        ...fields,
        notableFacts: [],
        oneOffEventsFired: [],
        createdAt: now,
      });
    }
    synced++;
  }

  // Retire + remove company entities no longer in the registry.
  const seasonEntities = await ctx.db
    .query("narrativeEntities")
    .withIndex("bySeason", (q) => q.eq("seasonId", seasonId))
    .collect();
  let removed = 0;
  for (const entity of seasonEntities) {
    if (entity.kind !== "company" || registrySlugs.has(entity.slug)) continue;
    const arcs = await ctx.db
      .query("narrativeArcs")
      .withIndex("bySeason", (q) => q.eq("seasonId", seasonId))
      .collect();
    for (const arc of arcs) {
      if (arc.primaryFirmSlug === entity.slug && arc.status === "active") {
        await ctx.db.patch(arc._id, {
          status: "abandoned" as const,
          arcStage: "retired" as const,
          tensionScore: 0,
          updatedAt: now,
        });
      }
    }
    await ctx.db.delete(entity._id);
    removed++;
  }

  return { synced, removed };
}

export const syncRegistryEntities = internalMutation({
  args: {},
  handler: async (ctx) => {
    const season = await ctx.db
      .query("narrativeSeasons")
      .withIndex("byIsActive", (q) => q.eq("isActive", true))
      .first();
    if (!season) {
      return { synced: 0, removed: 0, seasonMissing: true as const };
    }
    const res = await upsertRegistryCompanies(ctx, season._id);
    return { ...res, seasonMissing: false as const };
  },
});
