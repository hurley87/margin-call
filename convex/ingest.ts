import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  MARGIN_CALL_DEPLOYED_AT_BLOCK,
  SYNC_STATE_KEY,
} from "./lib/deployment";
import {
  type PositionEffect,
  type VerifiedLog,
  decodeEffectsFromLogs,
} from "./lib/events";

const verifiedLogValidator = v.object({
  address: v.string(),
  topics: v.array(v.string()),
  data: v.string(),
  blockNumber: v.number(),
  transactionHash: v.string(),
  logIndex: v.number(),
  blockTimestamp: v.optional(v.number()),
});

/**
 * Apply already-verified MarginCall lifecycle logs idempotently.
 * Callers must have filtered to the canonical contract and successful receipts.
 */
export const applyVerifiedLogs = internalMutation({
  args: {
    logs: v.array(verifiedLogValidator),
  },
  returns: v.object({
    applied: v.number(),
  }),
  handler: async (ctx, args) => {
    const logs = args.logs as VerifiedLog[];
    const effects = decodeEffectsFromLogs(logs);
    for (const effect of effects) {
      await applyEffect(ctx, effect);
    }
    return { applied: effects.length };
  },
});

async function applyEffect(ctx: MutationCtx, effect: PositionEffect) {
  const existing = await ctx.db
    .query("positions")
    .withIndex("by_tokenId", (q) => q.eq("tokenId", effect.tokenId))
    .unique();

  switch (effect.kind) {
    case "opened": {
      if (existing) {
        // Idempotent replay: do not reopen a terminal position.
        if (existing.status !== "active") {
          await ctx.db.patch(existing._id, {
            latestIndexedBlock: Math.max(
              existing.latestIndexedBlock,
              effect.blockNumber
            ),
          });
          return;
        }
        await ctx.db.patch(existing._id, {
          assetId: effect.assetId,
          owner: effect.owner,
          status: "active",
          openedBlock: effect.blockNumber,
          openedTxHash: effect.txHash,
          openedAt: effect.openedAt ?? existing.openedAt,
          latestIndexedBlock: Math.max(
            existing.latestIndexedBlock,
            effect.blockNumber
          ),
        });
        return;
      }
      await ctx.db.insert("positions", {
        tokenId: effect.tokenId,
        assetId: effect.assetId,
        owner: effect.owner,
        status: "active",
        openedBlock: effect.blockNumber,
        openedTxHash: effect.txHash,
        openedAt: effect.openedAt,
        latestIndexedBlock: effect.blockNumber,
      });
      return;
    }
    case "transfer": {
      if (!existing) {
        // Transfer without a prior open — ignore until Opened arrives.
        return;
      }
      if (existing.status !== "active") {
        await ctx.db.patch(existing._id, {
          latestIndexedBlock: Math.max(
            existing.latestIndexedBlock,
            effect.blockNumber
          ),
        });
        return;
      }
      await ctx.db.patch(existing._id, {
        owner: effect.owner,
        latestIndexedBlock: Math.max(
          existing.latestIndexedBlock,
          effect.blockNumber
        ),
      });
      return;
    }
    case "closed":
    case "liquidated": {
      const status = effect.kind;
      if (!existing) {
        await ctx.db.insert("positions", {
          tokenId: effect.tokenId,
          assetId: 0,
          owner: effect.owner,
          status,
          openedBlock: effect.blockNumber,
          openedTxHash: effect.txHash,
          latestIndexedBlock: effect.blockNumber,
          terminalBlock: effect.blockNumber,
          terminalTxHash: effect.txHash,
        });
        return;
      }
      await ctx.db.patch(existing._id, {
        owner: effect.owner,
        status,
        latestIndexedBlock: Math.max(
          existing.latestIndexedBlock,
          effect.blockNumber
        ),
        terminalBlock: effect.blockNumber,
        terminalTxHash: effect.txHash,
      });
      return;
    }
    default: {
      const _exhaustive: never = effect;
      return _exhaustive;
    }
  }
}

export const getSyncCursor = internalQuery({
  args: {},
  returns: v.union(
    v.object({
      cursorBlock: v.number(),
      lastRunAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("syncState")
      .withIndex("by_key", (q) => q.eq("key", SYNC_STATE_KEY))
      .unique();
    if (!row) return null;
    return { cursorBlock: row.cursorBlock, lastRunAt: row.lastRunAt };
  },
});

export const setSyncCursor = internalMutation({
  args: {
    cursorBlock: v.number(),
    lastRunAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("syncState")
      .withIndex("by_key", (q) => q.eq("key", SYNC_STATE_KEY))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        cursorBlock: args.cursorBlock,
        lastRunAt: args.lastRunAt,
      });
    } else {
      await ctx.db.insert("syncState", {
        key: SYNC_STATE_KEY,
        cursorBlock: args.cursorBlock,
        lastRunAt: args.lastRunAt,
      });
    }
    return null;
  },
});

/** Initial scan start when no cursor exists. */
export const deploymentStartBlock = internalQuery({
  args: {},
  returns: v.number(),
  handler: async () => {
    return MARGIN_CALL_DEPLOYED_AT_BLOCK;
  },
});
