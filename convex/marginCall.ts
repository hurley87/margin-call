import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { canonicalPrivyDid } from "./me";

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

function normalizeWallet(address: string): string {
  if (!EVM_ADDRESS.test(address)) {
    throw new Error("Invalid wallet address");
  }
  return address.toLowerCase();
}

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
    const walletAddress = normalizeWallet(args.walletAddress);
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
    v.object({ scheduled: v.literal(false), reason: v.string() })
  ),
  handler: async (ctx, args) => {
    const privyDid = await requireIdentity(ctx);
    const walletAddress = normalizeWallet(args.walletAddress);

    if (!/^\d+$/.test(args.ticketId) || !/^\d+$/.test(args.roundId)) {
      throw new Error("Invalid ticket or round id");
    }

    const consent = await ctx.db
      .query("marginCallConsent")
      .withIndex("by_did", (q) => q.eq("privyDid", privyDid))
      .unique();

    if (!consent || !consent.optedIn) {
      return { scheduled: false as const, reason: "not_opted_in" };
    }

    if (consent.walletAddress !== walletAddress) {
      return { scheduled: false as const, reason: "wallet_mismatch" };
    }

    const existing = await ctx.db
      .query("marginCallAttempts")
      .withIndex("by_ticketId", (q) => q.eq("ticketId", args.ticketId))
      .unique();

    if (existing) {
      return { scheduled: false as const, reason: "already_attempted" };
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
