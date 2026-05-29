import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  PREPARE_INSTRUCTIONS,
  type SerializedPreparedCall,
} from "./escrowConstants";

// Stored on the intent for observability/cleanup only. It does NOT gate
// confirmation: a human-in-the-loop Base Account approval can take longer than
// this, and once the on-chain tx has executed (irreversibly) refusing to record
// it would orphan a real deal / lock the pot. See `getForConfirm`.
const INTENT_TTL_MS = 60 * 60 * 1000;

/**
 * Shape an `intents.create` result into the response a prepare action returns:
 * either the cached confirmed result (replay) or the prepare envelope.
 */
export function shapePrepareResult(
  intent: {
    intentId: Id<"mcpIntents">;
    chain?: string;
    calls?: SerializedPreparedCall[];
    cached?: true;
    confirmResult?: unknown;
  },
  summary: string
): Record<string, unknown> {
  if (intent.cached) {
    return {
      cached: true,
      ...(intent.confirmResult as Record<string, unknown>),
    };
  }
  return {
    phase: "prepare" as const,
    intentId: intent.intentId,
    chain: intent.chain,
    calls: intent.calls,
    instructions: PREPARE_INSTRUCTIONS,
    summary,
  };
}

export const create = internalMutation({
  args: {
    deskManagerId: v.id("deskManagers"),
    intentType: v.string(),
    chain: v.string(),
    calls: v.array(
      v.object({
        to: v.string(),
        value: v.string(),
        data: v.string(),
      })
    ),
    payload: v.any(),
    idempotencyKey: v.optional(v.string()),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("mcpIntents")
        .withIndex("byDeskManagerAndIdempotencyKey", (q) =>
          q
            .eq("deskManagerId", args.deskManagerId)
            .eq("idempotencyKey", args.idempotencyKey)
        )
        .collect();
      // Reuse any pending intent for this idempotency key regardless of age:
      // re-preparing must never mint a second intent (and therefore a second
      // on-chain spend) for the same key, even after the TTL has elapsed.
      const pending = existing.find(
        (row) => row.intentType === args.intentType && row.status === "pending"
      );
      if (pending) {
        return {
          intentId: pending._id,
          chain: pending.chain,
          calls: pending.calls as SerializedPreparedCall[],
          reused: true as const,
        };
      }
      const confirmed = existing.find(
        (row) =>
          row.intentType === args.intentType &&
          row.status === "confirmed" &&
          row.confirmResult !== undefined
      );
      if (confirmed?.confirmResult) {
        return {
          intentId: confirmed._id,
          cached: true as const,
          confirmResult: confirmed.confirmResult,
        };
      }
    }

    const intentId = await ctx.db.insert("mcpIntents", {
      deskManagerId: args.deskManagerId,
      intentType: args.intentType,
      status: "pending",
      chain: args.chain,
      calls: args.calls,
      payload: args.payload,
      idempotencyKey: args.idempotencyKey,
      expiresAt: args.now + INTENT_TTL_MS,
      createdAt: args.now,
      updatedAt: args.now,
    });

    return {
      intentId,
      chain: args.chain,
      calls: args.calls,
      reused: false as const,
    };
  },
});

export const getForConfirm = internalQuery({
  args: {
    intentId: v.id("mcpIntents"),
    deskManagerId: v.id("deskManagers"),
    now: v.number(),
  },
  handler: async (ctx, { intentId, deskManagerId }) => {
    const intent = await ctx.db.get(intentId);
    if (!intent || intent.deskManagerId !== deskManagerId) {
      throw new Error("Intent not found");
    }
    if (intent.status === "confirmed" && intent.confirmResult !== undefined) {
      return { intent, alreadyConfirmed: true as const };
    }
    if (intent.status !== "pending") {
      throw new Error(`Intent is ${intent.status}`);
    }
    // Intentionally NOT rejecting on `expiresAt`: confirm always supplies a
    // txHash that the caller has already broadcast and that each confirm
    // handler verifies + binds to this intent (DealCreated event / on-chain
    // status / balance re-read). Rejecting a late-but-executed tx would orphan
    // a real on-chain deal and lock the pot with no recovery path.
    return { intent, alreadyConfirmed: false as const };
  },
});

export const markConfirmed = internalMutation({
  args: {
    intentId: v.id("mcpIntents"),
    txHash: v.string(),
    confirmResult: v.any(),
    now: v.number(),
  },
  handler: async (ctx, { intentId, txHash, confirmResult, now }) => {
    const reused = await ctx.db
      .query("mcpIntents")
      .withIndex("byTxHash", (q) => q.eq("txHash", txHash))
      .collect();
    if (reused.some((row) => row._id !== intentId)) {
      throw new Error(
        "This txHash has already been used to confirm a different intent"
      );
    }
    await ctx.db.patch(intentId, {
      status: "confirmed",
      txHash,
      confirmResult,
      updatedAt: now,
    });
  },
});
