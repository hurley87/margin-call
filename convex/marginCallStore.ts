import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const attemptStatus = v.union(
  v.literal("pending"),
  v.literal("placed"),
  v.literal("skipped"),
  v.literal("failed")
);

export const getAttempt = internalQuery({
  args: { attemptId: v.id("marginCallAttempts") },
  returns: v.union(
    v.object({
      _id: v.id("marginCallAttempts"),
      _creationTime: v.number(),
      ticketId: v.string(),
      roundId: v.string(),
      walletAddress: v.string(),
      privyDid: v.string(),
      status: attemptStatus,
      twilioCallSid: v.optional(v.string()),
      reason: v.optional(v.string()),
      createdAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args): Promise<Doc<"marginCallAttempts"> | null> => {
    return await ctx.db.get(args.attemptId);
  },
});

export const getConsentByDid = internalQuery({
  args: { privyDid: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("marginCallConsent"),
      _creationTime: v.number(),
      privyDid: v.string(),
      walletAddress: v.string(),
      optedIn: v.boolean(),
      updatedAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args): Promise<Doc<"marginCallConsent"> | null> => {
    return await ctx.db
      .query("marginCallConsent")
      .withIndex("by_did", (q) => q.eq("privyDid", args.privyDid))
      .unique();
  },
});

export const markAttempt = internalMutation({
  args: {
    attemptId: v.id("marginCallAttempts"),
    status: attemptStatus,
    reason: v.optional(v.string()),
    twilioCallSid: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) {
      return null;
    }
    // Never overwrite a terminal placed/skipped/failed with pending.
    if (attempt.status !== "pending" && args.status === "pending") {
      return null;
    }

    const patch: {
      status: Doc<"marginCallAttempts">["status"];
      reason?: string;
      twilioCallSid?: string;
    } = { status: args.status };

    if (args.reason !== undefined) {
      patch.reason = args.reason;
    }
    if (args.twilioCallSid !== undefined) {
      patch.twilioCallSid = args.twilioCallSid;
    }

    await ctx.db.patch(args.attemptId as Id<"marginCallAttempts">, patch);
    return null;
  },
});
