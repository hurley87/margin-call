/**
 * MCP treasury prepare/confirm facade over chainIntents (#249).
 * Stable intent identity; ambiguous submissions reconcile by txHash.
 */
import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  PREPARE_INSTRUCTIONS,
  type SerializedPreparedCall,
} from "./escrowConstants";
import {
  assertTransition,
  isTerminalStatus,
  type ChainIntentStatus,
} from "../lib/chainIntents/stateMachine";
import { isNetworkSlug } from "../lib/networks";

const INTENT_TTL_MS = 60 * 60 * 1000;

/**
 * Shape a prepare result into the response a prepare action returns:
 * either the cached confirmed result (replay) or the prepare envelope.
 */
export function shapePrepareResult(
  intent: {
    intentId: Id<"chainIntents">;
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

function mcpIntentKey(
  deskManagerId: Id<"deskManagers">,
  intentType: string,
  idempotencyKey: string | undefined,
  now: number
): string {
  if (idempotencyKey && idempotencyKey.trim() !== "") {
    return `mcp:${deskManagerId}:${intentType}:${idempotencyKey}`;
  }
  return `mcp:${deskManagerId}:${intentType}:${now}`;
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
    if (!isNetworkSlug(args.chain)) {
      throw new Error(`Unknown network slug "${args.chain}"`);
    }

    const intentKey = mcpIntentKey(
      args.deskManagerId,
      args.intentType,
      args.idempotencyKey,
      args.now
    );

    const existing = await ctx.db
      .query("chainIntents")
      .withIndex("byIntentKey", (q) => q.eq("intentKey", intentKey))
      .collect();

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

    const active = existing.find(
      (row) =>
        row.intentType === args.intentType &&
        !isTerminalStatus(row.status as ChainIntentStatus)
    );
    if (active) {
      if (active.status === "prepared" || active.status === "signing") {
        await ctx.db.patch(active._id, {
          calls: args.calls,
          payload: args.payload,
          networkSlug: args.chain,
          expiresAt: args.now + INTENT_TTL_MS,
          updatedAt: args.now,
        });
      }
      return {
        intentId: active._id,
        chain: active.networkSlug,
        calls: (active.calls ?? args.calls) as SerializedPreparedCall[],
        reused: true as const,
      };
    }

    const intentId = await ctx.db.insert("chainIntents", {
      networkSlug: args.chain,
      intentKey,
      intentType: args.intentType,
      status: "prepared",
      deskManagerId: args.deskManagerId,
      calls: args.calls,
      payload: args.payload,
      attempts: 0,
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
    intentId: v.id("chainIntents"),
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
    // Allow confirm from prepared/signing/submitted/reconciling — the client
    // already broadcast the tx. Map to a pending-compatible view for callers.
    if (
      intent.status !== "prepared" &&
      intent.status !== "signing" &&
      intent.status !== "submitted" &&
      intent.status !== "reconciling"
    ) {
      throw new Error(`Intent is ${intent.status}`);
    }
    return {
      intent: {
        ...intent,
        // Legacy callers expect `chain` and `status: pending`.
        chain: intent.networkSlug,
        status: "pending" as const,
      },
      alreadyConfirmed: false as const,
    };
  },
});

/**
 * Cron entrypoint: abandon prepared intents past their TTL.
 * Rows are kept so intentKey lookup won't reuse an abandoned envelope.
 */
export const expirePending = internalMutation({
  args: {},
  returns: v.object({ expired: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("chainIntents")
      .withIndex("byStatus", (q) => q.eq("status", "prepared"))
      .take(200);

    let expired = 0;
    for (const row of rows) {
      if (row.expiresAt !== undefined && row.expiresAt < now) {
        assertTransition("prepared", "abandoned");
        await ctx.db.patch(row._id, {
          status: "abandoned",
          updatedAt: now,
          lastError: "TTL expired before submit",
        });
        expired += 1;
      }
    }
    if (expired > 0) {
      console.log(
        `[mcp/intents] abandoned ${expired} prepared intent(s) past TTL`
      );
    }
    return { expired };
  },
});

export const markConfirmed = internalMutation({
  args: {
    intentId: v.id("chainIntents"),
    txHash: v.string(),
    confirmResult: v.any(),
    now: v.number(),
  },
  handler: async (ctx, { intentId, txHash, confirmResult, now }) => {
    const intent = await ctx.db.get(intentId);
    if (!intent) throw new Error("Intent not found");

    const reused = await ctx.db
      .query("chainIntents")
      .withIndex("byTxHash", (q) => q.eq("txHash", txHash))
      .collect();
    if (reused.some((row) => row._id !== intentId)) {
      throw new Error(
        "This txHash has already been used to confirm a different intent"
      );
    }

    if (intent.status === "confirmed") {
      return;
    }

    // prepared/signing → submitted → confirmed (never skip identity binding).
    let status = intent.status as ChainIntentStatus;
    if (status === "prepared" || status === "signing") {
      assertTransition(status, "submitted");
      await ctx.db.patch(intentId, {
        status: "submitted",
        txHash,
        submittedAt: now,
        attempts: intent.attempts + 1,
        updatedAt: now,
      });
      status = "submitted";
    }

    if (status === "reconciling" || status === "submitted") {
      assertTransition(status, "confirmed");
      await ctx.db.patch(intentId, {
        status: "confirmed",
        txHash,
        confirmResult,
        confirmedAt: now,
        updatedAt: now,
      });
      return;
    }

    throw new Error(`Intent is ${intent.status}`);
  },
});
