import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { MARGIN_CALL_ADDRESS, SYNC_STATE_KEY } from "./lib/deployment";
import {
  type PositionEffect,
  type WireLog,
  decodeEffectsFromLogs,
} from "./lib/events";

const wireLogValidator = v.object({
  address: v.string(),
  topics: v.array(v.string()),
  data: v.string(),
  blockNumber: v.number(),
  transactionHash: v.string(),
  logIndex: v.number(),
});

/**
 * Apply already-verified MarginCall lifecycle logs idempotently.
 * Callers must have filtered to the canonical contract and successful receipts.
 */
export const applyVerifiedLogs = internalMutation({
  args: {
    logs: v.array(wireLogValidator),
  },
  returns: v.object({
    applied: v.number(),
  }),
  handler: async (ctx, args) => {
    const logs: WireLog[] = args.logs;
    const effects = decodeEffectsFromLogs(logs);
    for (const effect of effects) {
      await applyEffect(ctx, effect);
    }
    return { applied: effects.length };
  },
});

/** True when (block, logIndex) is strictly after the row's applied cursor. */
function isNewerThan(
  effect: Pick<PositionEffect, "blockNumber" | "logIndex">,
  existing: Doc<"positions">
): boolean {
  if (effect.blockNumber > existing.latestIndexedBlock) {
    return true;
  }
  if (effect.blockNumber < existing.latestIndexedBlock) {
    return false;
  }
  return effect.logIndex > existing.latestIndexedLogIndex;
}

function advanceCursor(
  effect: Pick<PositionEffect, "blockNumber" | "logIndex">
): {
  latestIndexedBlock: number;
  latestIndexedLogIndex: number;
} {
  return {
    latestIndexedBlock: effect.blockNumber,
    latestIndexedLogIndex: effect.logIndex,
  };
}

async function applyEffect(ctx: MutationCtx, effect: PositionEffect) {
  const existing = await ctx.db
    .query("positions")
    .withIndex("by_tokenId", (q) => q.eq("tokenId", effect.tokenId))
    .unique();

  switch (effect.kind) {
    case "opened": {
      if (!existing) {
        await ctx.db.insert("positions", {
          tokenId: effect.tokenId,
          assetId: effect.assetId,
          owner: effect.owner,
          status: "active",
          openedBlock: effect.blockNumber,
          openedTxHash: effect.txHash,
          ...advanceCursor(effect),
        });
        return;
      }

      // Identity is write-from-Opened; never reopen a terminal row.
      const patch: Partial<Doc<"positions">> = {
        assetId: effect.assetId,
        openedBlock: effect.blockNumber,
        openedTxHash: effect.txHash,
      };

      // Owner (and cursor) only move forward on a newer event while active.
      if (existing.status === "active" && isNewerThan(effect, existing)) {
        patch.owner = effect.owner;
        Object.assign(patch, advanceCursor(effect));
      }

      await ctx.db.patch(existing._id, patch);
      return;
    }
    case "transfer": {
      if (!existing || existing.status !== "active") {
        return;
      }
      if (!isNewerThan(effect, existing)) {
        return;
      }
      await ctx.db.patch(existing._id, {
        owner: effect.owner,
        ...advanceCursor(effect),
      });
      return;
    }
    case "closed":
    case "liquidated": {
      if (!existing) {
        // Terminal before open — skip; reconcile will apply Opened then terminal.
        return;
      }
      if (!isNewerThan(effect, existing)) {
        return;
      }
      await ctx.db.patch(existing._id, {
        owner: effect.owner,
        status: effect.kind,
        terminalBlock: effect.blockNumber,
        terminalTxHash: effect.txHash,
        ...advanceCursor(effect),
      });
      return;
    }
    default: {
      const _exhaustive: never = effect;
      return _exhaustive;
    }
  }
}

/** Rows deleted per call, so one reset cannot exceed a mutation's time budget. */
const RESET_BATCH = 200;

/**
 * Drop the read model after the canonical coordinator is redeployed.
 *
 * Indexed positions are keyed by token id, which a new `MarginCall` restarts at
 * 1, so keeping the old rows would mean two different positions claiming the
 * same id. Deleting the sync cursor restarts indexing from
 * `MARGIN_CALL_DEPLOYED_AT_BLOCK` — the one definition of the start block.
 *
 * `marginCall` must match the address this deployment was built against, so the
 * reset can only run *after* `deployments/base.json` and Convex are both on the
 * new coordinator. Running it a batch at a time keeps it safe at any table size;
 * re-run while `remaining` is true.
 */
export const resetForRedeploy = internalMutation({
  args: { marginCall: v.string() },
  returns: v.object({
    deleted: v.number(),
    remaining: v.boolean(),
    cursorCleared: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (args.marginCall.toLowerCase() !== MARGIN_CALL_ADDRESS) {
      throw new Error(
        `Refusing reset: this deployment indexes ${MARGIN_CALL_ADDRESS}, not ${args.marginCall.toLowerCase()}`
      );
    }

    const batch = await ctx.db.query("positions").take(RESET_BATCH + 1);
    const remaining = batch.length > RESET_BATCH;
    const doomed = remaining ? batch.slice(0, RESET_BATCH) : batch;
    for (const row of doomed) {
      await ctx.db.delete(row._id);
    }

    // Keep the cursor until the table is empty: clearing it early would let a
    // scheduled reconcile re-insert rows this reset has not reached yet.
    let cursorCleared = false;
    if (!remaining) {
      const cursor = await ctx.db
        .query("syncState")
        .withIndex("by_key", (q) => q.eq("key", SYNC_STATE_KEY))
        .unique();
      if (cursor) {
        await ctx.db.delete(cursor._id);
        cursorCleared = true;
      }
    }

    return { deleted: doomed.length, remaining, cursorCleared };
  },
});

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
