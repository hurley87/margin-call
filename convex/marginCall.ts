import { v } from "convex/values";
import { normalizeWalletAddress } from "@margin-call/shared/address";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import {
  marginCallAttemptReason,
  marginCallAttemptStatus,
  marginCallRequestSkipReason,
  marginCallTerminalStatus,
} from "./lib/marginCallValidators";
import { canonicalPrivyDid } from "./me";

async function requireIdentity(ctx: {
  auth: { getUserIdentity: () => Promise<{ subject: string } | null> };
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return canonicalPrivyDid(identity.subject);
}

/** Current player's Desk phone switch. Defaults to off when no row exists. */
export const myMarginCallConsent = query({
  args: {},
  returns: v.object({
    optedIn: v.boolean(),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { optedIn: false };
    }

    const privyDid = canonicalPrivyDid(identity.subject);
    const row = await ctx.db
      .query("marginCallConsent")
      .withIndex("by_did", (q) => q.eq("privyDid", privyDid))
      .unique();

    return { optedIn: row?.optedIn === true };
  },
});

/** Flip the Desk phone switch on or off. Never accepts a phone number. */
export const setMarginCallConsent = mutation({
  args: {
    optedIn: v.boolean(),
    walletAddress: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const privyDid = await requireIdentity(ctx);
    const walletAddress = normalizeWalletAddress(args.walletAddress);
    const updatedAt = Date.now();

    const existing = await ctx.db
      .query("marginCallConsent")
      .withIndex("by_did", (q) => q.eq("privyDid", privyDid))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        optedIn: args.optedIn,
        walletAddress,
        updatedAt,
      });
    } else {
      await ctx.db.insert("marginCallConsent", {
        privyDid,
        walletAddress,
        optedIn: args.optedIn,
        updatedAt,
      });
    }

    return null;
  },
});

/**
 * Schedule a promotional desk-phone call after a margin call, if the switch
 * is on. Idempotent per ticketId. Never stores or accepts a phone number.
 */
export const requestMarginCall = mutation({
  args: {
    ticketId: v.string(),
    roundId: v.string(),
    walletAddress: v.string(),
  },
  returns: v.union(
    v.object({
      scheduled: v.literal(true),
      attemptId: v.id("marginCallAttempts"),
    }),
    v.object({
      scheduled: v.literal(false),
      reason: marginCallRequestSkipReason,
    })
  ),
  handler: async (ctx, args) => {
    const privyDid = await requireIdentity(ctx);
    const walletAddress = normalizeWalletAddress(args.walletAddress);

    if (!/^\d+$/.test(args.ticketId) || !/^\d+$/.test(args.roundId)) {
      throw new Error("Invalid ticket or round id");
    }

    const consent = await ctx.db
      .query("marginCallConsent")
      .withIndex("by_did", (q) => q.eq("privyDid", privyDid))
      .unique();

    if (!consent || !consent.optedIn) {
      return { scheduled: false as const, reason: "not_opted_in" as const };
    }

    if (consent.walletAddress !== walletAddress) {
      return { scheduled: false as const, reason: "wallet_mismatch" as const };
    }

    const existing = await ctx.db
      .query("marginCallAttempts")
      .withIndex("by_ticketId", (q) => q.eq("ticketId", args.ticketId))
      .unique();

    if (existing) {
      return {
        scheduled: false as const,
        reason: "already_attempted" as const,
      };
    }

    const attemptId = await ctx.db.insert("marginCallAttempts", {
      ticketId: args.ticketId,
      roundId: args.roundId,
      walletAddress,
      privyDid,
      status: "pending",
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.marginCallActions.placeCall, {
      attemptId,
    });

    return { scheduled: true as const, attemptId };
  },
});

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
      status: marginCallAttemptStatus,
      twilioCallSid: v.optional(v.string()),
      reason: v.optional(marginCallAttemptReason),
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
    status: marginCallTerminalStatus,
    reason: v.optional(marginCallAttemptReason),
    twilioCallSid: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.status !== "pending") {
      return null;
    }

    const patch: {
      status: Doc<"marginCallAttempts">["status"];
      reason?: Doc<"marginCallAttempts">["reason"];
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
