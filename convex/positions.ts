import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { normalizeWalletAddress } from "@margin-call/shared/address";
import { query } from "./_generated/server";
import { positionStatusValidator } from "./schema";

const positionDocValidator = v.object({
  _id: v.id("positions"),
  _creationTime: v.number(),
  tokenId: v.string(),
  assetId: v.number(),
  owner: v.string(),
  status: positionStatusValidator,
  openedBlock: v.number(),
  openedTxHash: v.string(),
  latestIndexedBlock: v.number(),
  latestIndexedLogIndex: v.number(),
  terminalBlock: v.optional(v.number()),
  terminalTxHash: v.optional(v.string()),
});

export const positionByTokenId = query({
  args: {
    tokenId: v.string(),
  },
  returns: v.union(positionDocValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("positions")
      .withIndex("by_tokenId", (q) => q.eq("tokenId", args.tokenId))
      .unique();
  },
});

export const positionsByOwner = query({
  args: {
    owner: v.string(),
    status: v.optional(positionStatusValidator),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(positionDocValidator),
  handler: async (ctx, args) => {
    const owner = normalizeWalletAddress(args.owner);
    if (args.status !== undefined) {
      const status = args.status;
      return await ctx.db
        .query("positions")
        .withIndex("by_owner_and_status", (q) =>
          q.eq("owner", owner).eq("status", status)
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }
    return await ctx.db
      .query("positions")
      .withIndex("by_owner", (q) => q.eq("owner", owner))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const allPositions = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(positionStatusValidator),
    assetId: v.optional(v.number()),
  },
  returns: paginationResultValidator(positionDocValidator),
  handler: async (ctx, args) => {
    if (args.assetId !== undefined && args.status === undefined) {
      throw new Error("assetId requires status");
    }
    if (args.assetId !== undefined && args.status !== undefined) {
      const { assetId, status } = args;
      return await ctx.db
        .query("positions")
        .withIndex("by_assetId_and_status", (q) =>
          q.eq("assetId", assetId).eq("status", status)
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }
    if (args.status !== undefined) {
      const { status } = args;
      return await ctx.db
        .query("positions")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .paginate(args.paginationOpts);
    }
    return await ctx.db
      .query("positions")
      .withIndex("by_openedBlock")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
