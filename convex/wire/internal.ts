import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

/** Load the active season with its entities and active arcs in one pass. */
export const loadActiveSeason = internalQuery({
  args: {},
  handler: async (ctx) => {
    const season = await ctx.db
      .query("narrativeSeasons")
      .withIndex("byIsActive", (q) => q.eq("isActive", true))
      .first();
    if (!season) return null;

    const [entities, arcs] = await Promise.all([
      ctx.db
        .query("narrativeEntities")
        .withIndex("bySeason", (q) => q.eq("seasonId", season._id))
        .collect(),
      ctx.db
        .query("narrativeArcs")
        .withIndex("bySeasonAndStatus", (q) =>
          q.eq("seasonId", season._id).eq("status", "active")
        )
        .collect(),
    ]);

    return { season, entities, arcs };
  },
});

/** Newest-first Wire Drops with the fields the assembler needs. */
export const listRecentDrops = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const cap = Math.min(Math.max(limit, 1), 20);
    return ctx.db
      .query("marketNarratives")
      .withIndex("byEpoch")
      .order("desc")
      .take(cap);
  },
});

/**
 * Recent game events since a given timestamp.
 * Minimal version: wipeouts + high-pot deal creations.
 */
export const listRecentGameEvents = internalQuery({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const [wipeouts, deals] = await Promise.all([
      ctx.db
        .query("dealOutcomes")
        .withIndex("byCreatedAt", (q) => q.gte("createdAt", since))
        .order("desc")
        .filter((q) => q.eq(q.field("traderWipedOut"), true))
        .take(10),
      ctx.db
        .query("deals")
        .withIndex("byCreatedAt", (q) => q.gte("createdAt", since))
        .order("desc")
        .filter((q) => q.gte(q.field("potUsdc"), 1000))
        .take(10),
    ]);

    const events: Array<{ type: string; summary: string }> = [];

    for (const w of wipeouts) {
      events.push({
        type: "wipeout",
        summary: `Trader ${w.traderId} wiped out${w.wipeoutReason ? ` (${w.wipeoutReason})` : ""}`,
      });
    }

    for (const d of deals) {
      events.push({
        type: "high_pot_deal",
        summary: `New deal opened: "${d.prompt.slice(0, 60)}" (pot: $${d.potUsdc})`,
      });
    }

    return events;
  },
});

/** Fast pre-check: does a drop with this epochSlot already exist? */
export const findBySlot = internalQuery({
  args: { epochSlot: v.number() },
  handler: async (ctx, { epochSlot }) => {
    return ctx.db
      .query("marketNarratives")
      .withIndex("byEpochSlot", (q) => q.eq("epochSlot", epochSlot))
      .first();
  },
});
