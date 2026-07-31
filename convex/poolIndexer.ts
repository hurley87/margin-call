import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";

const basketEntry = v.object({
  asset: v.string(),
  amount: v.string(),
  symbol: v.union(v.string(), v.null()),
});

const navBucket = v.object({
  minUsd: v.number(),
  maxUsd: v.union(v.number(), v.null()),
  count: v.number(),
});

export const getCursor = internalQuery({
  args: { key: v.string() },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("chainCursors")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    return row?.blockNumber ?? null;
  },
});

export const setCursor = internalMutation({
  args: { key: v.string(), blockNumber: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("chainCursors")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { blockNumber: args.blockNumber });
    } else {
      await ctx.db.insert("chainCursors", {
        key: args.key,
        blockNumber: args.blockNumber,
      });
    }
    return null;
  },
});

export const upsertPack = internalMutation({
  args: {
    tokenId: v.number(),
    maker: v.string(),
    basket: v.array(basketEntry),
    navUsdWad: v.union(v.string(), v.null()),
    status: v.union(
      v.literal("resting"),
      v.literal("exited"),
      v.literal("ripped"),
      v.literal("unlisted")
    ),
    eligible: v.boolean(),
    updatedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("packs")
      .withIndex("by_tokenId", (q) => q.eq("tokenId", args.tokenId))
      .unique();
    if (existing) {
      // The contracts have independent cursors. Preserve irreversible custody
      // states against a delayed PackExited/PackEntered event, but allow the
      // more specific PackRipped event to upgrade an earlier PackUnlisted.
      const staleAgainstTerminalState =
        (existing.status === "ripped" && args.status !== "ripped") ||
        (existing.status === "unlisted" &&
          (args.status === "exited" || args.status === "resting"));
      if (staleAgainstTerminalState) {
        await ctx.db.patch(existing._id, { updatedAt: args.updatedAt });
      } else {
        await ctx.db.patch(existing._id, args);
      }
    } else {
      await ctx.db.insert("packs", args);
    }
    return null;
  },
});

export const writeSnapshot = internalMutation({
  args: {
    eligibleCount: v.number(),
    restingCount: v.number(),
    harmonicMeanNavWad: v.union(v.string(), v.null()),
    ripUnitPriceWad: v.union(v.string(), v.null()),
    navDistribution: v.array(navBucket),
    blockNumber: v.number(),
    updatedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("poolSnapshots")
      .withIndex("by_key", (q) => q.eq("key", "latest"))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("poolSnapshots", {
        key: "latest",
        ...args,
      });
    }
    return null;
  },
});
