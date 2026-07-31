import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";

import { query } from "./_generated/server";
import { normalizeWalletAddress } from "./lib/chain/walletAddress";

const navBucketValidator = v.object({
  minUsd: v.number(),
  maxUsd: v.union(v.number(), v.null()),
  count: v.number(),
});

const basketEntryValidator = v.object({
  asset: v.string(),
  amount: v.string(),
  symbol: v.union(v.string(), v.null()),
});

const packStatusValidator = v.union(
  v.literal("resting"),
  v.literal("exited"),
  v.literal("ripped"),
  v.literal("unlisted")
);

const indexedPackValidator = v.object({
  tokenId: v.number(),
  maker: v.string(),
  basket: v.array(basketEntryValidator),
  navUsdWad: v.union(v.string(), v.null()),
  status: packStatusValidator,
  eligible: v.boolean(),
  updatedAt: v.number(),
});

const emptySnapshot = {
  eligibleCount: 0,
  restingCount: 0,
  harmonicMeanNavWad: null as string | null,
  ripUnitPriceWad: null as string | null,
  navDistribution: [] as Array<{
    minUsd: number;
    maxUsd: number | null;
    count: number;
  }>,
  blockNumber: 0,
  updatedAt: 0,
};

/** Latest indexed Pool Statistics (empty defaults when indexer has not run). */
export const getPoolStatistics = query({
  args: {},
  returns: v.object({
    eligibleCount: v.number(),
    restingCount: v.number(),
    harmonicMeanNavWad: v.union(v.string(), v.null()),
    ripUnitPriceWad: v.union(v.string(), v.null()),
    navDistribution: v.array(navBucketValidator),
    blockNumber: v.number(),
    updatedAt: v.number(),
  }),
  handler: async (ctx) => {
    const snap = await ctx.db
      .query("poolSnapshots")
      .withIndex("by_key", (q) => q.eq("key", "latest"))
      .unique();
    if (!snap) return emptySnapshot;
    return {
      eligibleCount: snap.eligibleCount,
      restingCount: snap.restingCount,
      harmonicMeanNavWad: snap.harmonicMeanNavWad,
      ripUnitPriceWad: snap.ripUnitPriceWad,
      navDistribution: snap.navDistribution,
      blockNumber: snap.blockNumber,
      updatedAt: snap.updatedAt,
    };
  },
});

/** Paginated Pack list (resting first via status filter optional). */
export const listPacks = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(
      v.union(
        v.literal("resting"),
        v.literal("exited"),
        v.literal("ripped"),
        v.literal("unlisted")
      )
    ),
  },
  returns: v.object({
    page: v.array(
      v.object({
        tokenId: v.number(),
        maker: v.string(),
        basket: v.array(basketEntryValidator),
        navUsdWad: v.union(v.string(), v.null()),
        status: v.union(
          v.literal("resting"),
          v.literal("exited"),
          v.literal("ripped"),
          v.literal("unlisted")
        ),
        eligible: v.boolean(),
        updatedAt: v.number(),
      })
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const base = args.status
      ? ctx.db
          .query("packs")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
      : ctx.db.query("packs").withIndex("by_tokenId");

    const result = await base.order("desc").paginate(args.paginationOpts);
    return {
      page: result.page.map((p) => ({
        tokenId: p.tokenId,
        maker: p.maker,
        basket: p.basket,
        navUsdWad: p.navUsdWad,
        status: p.status,
        eligible: p.eligible,
        updatedAt: p.updatedAt,
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/** Public, paginated Pack history for a normalized Maker wallet. */
export const listPacksByMaker = query({
  args: {
    paginationOpts: paginationOptsValidator,
    maker: v.string(),
    status: v.optional(packStatusValidator),
  },
  returns: paginationResultValidator(indexedPackValidator),
  handler: async (ctx, args) => {
    // Pack ownership here is public indexed chain data. The wallet argument is
    // a lookup key, not an authorization claim about the caller.
    const maker = normalizeWalletAddress(args.maker);
    const packs = args.status
      ? ctx.db
          .query("packs")
          .withIndex("by_maker_and_status", (q) =>
            q.eq("maker", maker).eq("status", args.status!)
          )
      : ctx.db
          .query("packs")
          .withIndex("by_maker_and_status", (q) => q.eq("maker", maker));

    const result = await packs.order("desc").paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((pack) => ({
        tokenId: pack.tokenId,
        maker: pack.maker,
        basket: pack.basket,
        navUsdWad: pack.navUsdWad,
        status: pack.status,
        eligible: pack.eligible,
        updatedAt: pack.updatedAt,
      })),
    };
  },
});

export const getPack = query({
  args: { tokenId: v.number() },
  returns: v.union(
    v.object({
      tokenId: v.number(),
      maker: v.string(),
      basket: v.array(basketEntryValidator),
      navUsdWad: v.union(v.string(), v.null()),
      status: v.union(
        v.literal("resting"),
        v.literal("exited"),
        v.literal("ripped"),
        v.literal("unlisted")
      ),
      eligible: v.boolean(),
      updatedAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const pack = await ctx.db
      .query("packs")
      .withIndex("by_tokenId", (q) => q.eq("tokenId", args.tokenId))
      .unique();
    if (!pack) return null;
    return {
      tokenId: pack.tokenId,
      maker: pack.maker,
      basket: pack.basket,
      navUsdWad: pack.navUsdWad,
      status: pack.status,
      eligible: pack.eligible,
      updatedAt: pack.updatedAt,
    };
  },
});
