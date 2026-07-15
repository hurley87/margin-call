/**
 * Deal-tweet Convex store: queries + mutations (V8 runtime).
 * The Node action in dealTweet.ts schedules against these.
 */

import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { NarrativeSubjectSource } from "./dealTweetText";

type DispatchHeadline = { headline?: string };

/**
 * Load deal + optional source wire narrative for subject ($SYMBOL) resolution.
 */
export const loadDealTweetContext = internalQuery({
  args: { dealId: v.id("deals") },
  handler: async (ctx, { dealId }) => {
    const deal = await ctx.db.get(dealId);
    if (!deal) return null;

    let narrative: NarrativeSubjectSource | null = null;

    const link = await ctx.db
      .query("wireDealSeedLinks")
      .withIndex("byDeal", (q) => q.eq("dealId", dealId))
      .first();

    if (link) {
      const seed = await ctx.db.get(link.seedId);
      if (seed) {
        const drop = await ctx.db.get(seed.epochId);
        if (drop) {
          narrative = {
            worldState: drop.worldState as NarrativeSubjectSource["worldState"],
            tweetSubjectHandle: drop.tweetSubjectHandle ?? null,
            sourceTrace:
              drop.sourceTrace as NarrativeSubjectSource["sourceTrace"],
          };
        }
      }
    }

    if (!narrative && deal.sourceHeadline) {
      const recent = await ctx.db
        .query("marketNarratives")
        .withIndex("byCreatedAt")
        .order("desc")
        .take(40);
      const match = recent.find((drop) => {
        const headlines = (drop.headlines ?? []) as DispatchHeadline[];
        return headlines.some((h) => h.headline === deal.sourceHeadline);
      });
      if (match) {
        narrative = {
          worldState: match.worldState as NarrativeSubjectSource["worldState"],
          tweetSubjectHandle: match.tweetSubjectHandle ?? null,
          sourceTrace:
            match.sourceTrace as NarrativeSubjectSource["sourceTrace"],
        };
      }
    }

    return {
      dealId: deal._id,
      prompt: deal.prompt,
      potUsdc: deal.potUsdc,
      entryCostUsdc: deal.entryCostUsdc,
      tweetStatus: deal.tweetStatus ?? null,
      narrative,
    };
  },
});

export const recordDealTweetStatus = internalMutation({
  args: {
    dealId: v.id("deals"),
    tweetStatus: v.string(),
    tweetVariant: v.optional(v.string()),
  },
  handler: async (ctx, { dealId, tweetStatus, tweetVariant }) => {
    const deal = await ctx.db.get(dealId);
    if (!deal) return;
    await ctx.db.patch(dealId, {
      tweetStatus,
      ...(tweetVariant !== undefined ? { tweetVariant } : {}),
      updatedAt: Date.now(),
    });
  },
});
