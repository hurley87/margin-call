/**
 * Chain intent mutations (#249).
 * Thin wrappers around the pure state machine in lib/chainIntents/stateMachine.
 */
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  assertTransition,
  isReusableStatus,
  isTerminalStatus,
  type ChainIntentStatus,
} from "./lib/chainIntents/stateMachine";
import { isNetworkSlug } from "./lib/networks";

const statusValidator = v.union(
  v.literal("prepared"),
  v.literal("signing"),
  v.literal("submitted"),
  v.literal("confirmed"),
  v.literal("failed"),
  v.literal("reconciling"),
  v.literal("abandoned")
);

const callValidator = v.object({
  to: v.string(),
  value: v.string(),
  data: v.string(),
});

const INTENT_TTL_MS = 60 * 60 * 1000;

/**
 * Create or reuse a prepared intent under a stable intentKey.
 * Re-prepare never mints a second identity for the same key while a
 * non-terminal intent exists.
 */
export const prepare = internalMutation({
  args: {
    networkSlug: v.string(),
    intentKey: v.string(),
    intentType: v.string(),
    deskManagerId: v.optional(v.id("deskManagers")),
    calls: v.optional(v.array(callValidator)),
    payload: v.optional(v.any()),
    now: v.number(),
  },
  returns: v.object({
    intentId: v.id("chainIntents"),
    status: statusValidator,
    reused: v.boolean(),
    cached: v.optional(v.boolean()),
    confirmResult: v.optional(v.any()),
  }),
  handler: async (ctx, args) => {
    if (!isNetworkSlug(args.networkSlug)) {
      throw new Error(`Unknown network slug "${args.networkSlug}"`);
    }
    if (!args.intentKey.trim()) {
      throw new Error("intentKey is required");
    }

    const existing = await ctx.db
      .query("chainIntents")
      .withIndex("byIntentKey", (q) => q.eq("intentKey", args.intentKey))
      .collect();

    const confirmed = existing.find(
      (row) => row.status === "confirmed" && row.confirmResult !== undefined
    );
    if (confirmed) {
      return {
        intentId: confirmed._id,
        status: confirmed.status as ChainIntentStatus,
        reused: true,
        cached: true,
        confirmResult: confirmed.confirmResult,
      };
    }

    const active = existing.find(
      (row) => !isTerminalStatus(row.status as ChainIntentStatus)
    );
    if (active) {
      if (!isReusableStatus(active.status as ChainIntentStatus)) {
        // submitted / reconciling: return the same identity without regressing
        return {
          intentId: active._id,
          status: active.status as ChainIntentStatus,
          reused: true,
        };
      }
      await ctx.db.patch(active._id, {
        intentType: args.intentType,
        calls: args.calls,
        payload: args.payload,
        networkSlug: args.networkSlug,
        deskManagerId: args.deskManagerId,
        expiresAt: args.now + INTENT_TTL_MS,
        updatedAt: args.now,
      });
      return {
        intentId: active._id,
        status: active.status as ChainIntentStatus,
        reused: true,
      };
    }

    const intentId = await ctx.db.insert("chainIntents", {
      networkSlug: args.networkSlug,
      intentKey: args.intentKey,
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
      status: "prepared" as const,
      reused: false,
    };
  },
});

export const transition = internalMutation({
  args: {
    intentId: v.id("chainIntents"),
    to: statusValidator,
    now: v.number(),
    txHash: v.optional(v.string()),
    senderAddress: v.optional(v.string()),
    senderNonce: v.optional(v.number()),
    lastError: v.optional(v.string()),
    confirmResult: v.optional(v.any()),
  },
  returns: v.object({
    intentId: v.id("chainIntents"),
    status: statusValidator,
  }),
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (!intent) throw new Error("Intent not found");

    const from = intent.status as ChainIntentStatus;
    const to = args.to as ChainIntentStatus;

    // Idempotent confirm / fail on already-terminal matching status.
    if (isTerminalStatus(from) && from === to) {
      return { intentId: intent._id, status: from };
    }

    assertTransition(from, to);

    if (args.txHash) {
      const reused = await ctx.db
        .query("chainIntents")
        .withIndex("byTxHash", (q) => q.eq("txHash", args.txHash))
        .collect();
      if (reused.some((row) => row._id !== intent._id)) {
        throw new Error(
          "This txHash has already been used to confirm a different intent"
        );
      }
    }

    const patch: Record<string, unknown> = {
      status: to,
      updatedAt: args.now,
    };
    if (args.txHash !== undefined) patch.txHash = args.txHash;
    if (args.senderAddress !== undefined)
      patch.senderAddress = args.senderAddress;
    if (args.senderNonce !== undefined) patch.senderNonce = args.senderNonce;
    if (args.lastError !== undefined) patch.lastError = args.lastError;
    if (args.confirmResult !== undefined)
      patch.confirmResult = args.confirmResult;
    if (to === "submitted" || to === "reconciling") {
      patch.submittedAt = intent.submittedAt ?? args.now;
      patch.attempts = intent.attempts + (to === "submitted" ? 1 : 0);
    }
    if (to === "confirmed") {
      patch.confirmedAt = args.now;
    }

    await ctx.db.patch(intent._id, patch);
    return { intentId: intent._id, status: to };
  },
});

export const getById = internalQuery({
  args: { intentId: v.id("chainIntents") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { intentId }) => {
    return await ctx.db.get(intentId);
  },
});

export const getByIntentKey = internalQuery({
  args: { intentKey: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, { intentKey }) => {
    return await ctx.db
      .query("chainIntents")
      .withIndex("byIntentKey", (q) => q.eq("intentKey", intentKey))
      .first();
  },
});

/** List stuck submitted/reconciling intents for the reconcile cron. */
export const listStuck = internalQuery({
  args: {
    olderThanMs: v.number(),
    now: v.number(),
    limit: v.number(),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const submitted = await ctx.db
      .query("chainIntents")
      .withIndex("byStatus", (q) => q.eq("status", "submitted"))
      .take(args.limit);
    const reconciling = await ctx.db
      .query("chainIntents")
      .withIndex("byStatus", (q) => q.eq("status", "reconciling"))
      .take(args.limit);

    const cutoff = args.now - args.olderThanMs;
    return [...submitted, ...reconciling].filter((row) => {
      const submittedAt = row.submittedAt ?? row.updatedAt;
      return submittedAt <= cutoff;
    });
  },
});
