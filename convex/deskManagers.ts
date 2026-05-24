import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import { normalizeEmail } from "../src/lib/email";

/** Internal: fetch desk manager by document ID (for server-side lookups). */
export const getByIdInternal = internalQuery({
  args: { id: v.id("deskManagers") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

/** Internal: fetch desk manager by Privy subject. */
export const getBySubject = internalQuery({
  args: { subject: v.string() },
  handler: async (ctx, { subject }) =>
    ctx.db
      .query("deskManagers")
      .withIndex("bySubject", (q) => q.eq("subject", subject))
      .unique(),
});

/** Returns the deskManager row for the authenticated Privy subject, or null. */
export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return (
      (await ctx.db
        .query("deskManagers")
        .withIndex("bySubject", (q) => q.eq("subject", identity.subject))
        .unique()) ?? null
    );
  },
});

/**
 * Creates or updates the deskManager row keyed on Privy subject.
 * `walletAddress` is write-once: the first non-null value is persisted and
 * subsequent calls leave it untouched, so a desk identity stays bound to its
 * original embedded wallet.
 */
export const upsertMe = mutation({
  args: {
    walletAddress: v.optional(v.string()),
    displayName: v.optional(v.string()),
    settings: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const now = Date.now();
    const email = normalizeEmail(identity.email);
    const existing = await ctx.db
      .query("deskManagers")
      .withIndex("bySubject", (q) => q.eq("subject", identity.subject))
      .unique();

    if (existing) {
      const patch: Record<string, unknown> = { updatedAt: now };
      if (
        args.walletAddress !== undefined &&
        existing.walletAddress === undefined
      )
        patch.walletAddress = args.walletAddress;
      if (args.displayName !== undefined) patch.displayName = args.displayName;
      if (args.settings !== undefined) patch.settings = args.settings;
      if (email !== undefined) patch.email = email;
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("deskManagers", {
      subject: identity.subject,
      email,
      walletAddress: args.walletAddress,
      displayName: args.displayName,
      settings: args.settings ?? {},
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Internal: sync the authenticated desk wallet's on-chain USDC balance. */
export const syncWalletBalance = internalMutation({
  args: {
    subject: v.string(),
    walletAddress: v.string(),
    balanceUsdc: v.number(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, { subject, walletAddress, balanceUsdc, email }) => {
    const now = Date.now();
    const normalizedEmail = normalizeEmail(email);
    const existing = await ctx.db
      .query("deskManagers")
      .withIndex("bySubject", (q) => q.eq("subject", subject))
      .unique();

    if (!existing) {
      await ctx.db.insert("deskManagers", {
        subject,
        email: normalizedEmail,
        walletAddress,
        walletBalanceUsdc: balanceUsdc,
        walletBalanceSyncedAt: now,
        settings: {},
        createdAt: now,
        updatedAt: now,
      });
      return { ok: true as const };
    }

    const needsAddress = existing.walletAddress === undefined;
    const needsEmail =
      normalizedEmail !== undefined && existing.email !== normalizedEmail;
    if (
      !needsAddress &&
      !needsEmail &&
      existing.walletBalanceUsdc === balanceUsdc
    ) {
      return { ok: true as const };
    }
    const patch: Record<string, unknown> = {
      walletBalanceUsdc: balanceUsdc,
      walletBalanceSyncedAt: now,
      updatedAt: now,
    };
    if (needsAddress) patch.walletAddress = walletAddress;
    if (needsEmail) patch.email = normalizedEmail;
    await ctx.db.patch(existing._id, patch);
    return { ok: true as const };
  },
});
