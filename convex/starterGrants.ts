import { v } from "convex/values";

import { internalMutation, internalQuery, query } from "./_generated/server";
import { STARTER_GRANT_CONFIG } from "./lib/starterGrantConfig";
import { normalizeWalletAddress } from "./lib/chain/walletAddress";

const grantStatusValidator = v.object({
  hasGrant: v.boolean(),
  grantedAt: v.union(v.number(), v.null()),
  lastRefillAt: v.union(v.number(), v.null()),
  refillCount: v.number(),
  grantAmount: v.number(),
  refillAmount: v.number(),
  refillAvailableAt: v.union(v.number(), v.null()),
  configVersion: v.number(),
});

/** Authenticated grant status for a wallet (null if unauthenticated). */
export const getStatus = query({
  args: { walletAddress: v.string() },
  returns: v.union(grantStatusValidator, v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const wallet = normalizeWalletAddress(args.walletAddress);
    const record = await ctx.db
      .query("starterGrants")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", wallet))
      .unique();

    const cfg = STARTER_GRANT_CONFIG;
    if (!record) {
      return {
        hasGrant: false,
        grantedAt: null,
        lastRefillAt: null,
        refillCount: 0,
        grantAmount: cfg.grantAmount,
        refillAmount: cfg.refillAmount,
        refillAvailableAt: null,
        configVersion: cfg.version,
      };
    }

    const last = record.lastRefillAt ?? record.grantedAt;
    return {
      hasGrant: true,
      grantedAt: record.grantedAt,
      lastRefillAt: record.lastRefillAt,
      refillCount: record.refillCount,
      grantAmount: cfg.grantAmount,
      refillAmount: cfg.refillAmount,
      refillAvailableAt: last + cfg.refillCooldownMs,
      configVersion: cfg.version,
    };
  },
});

export const getByWallet = internalQuery({
  args: { walletAddress: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("starterGrants"),
      walletAddress: v.string(),
      privySubject: v.string(),
      grantedAt: v.number(),
      grantAmount: v.number(),
      lastRefillAt: v.union(v.number(), v.null()),
      refillCount: v.number(),
      configVersion: v.number(),
      lastMintTxHash: v.optional(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const wallet = normalizeWalletAddress(args.walletAddress);
    const record = await ctx.db
      .query("starterGrants")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", wallet))
      .unique();
    if (!record) return null;
    return {
      _id: record._id,
      walletAddress: record.walletAddress,
      privySubject: record.privySubject,
      grantedAt: record.grantedAt,
      grantAmount: record.grantAmount,
      lastRefillAt: record.lastRefillAt,
      refillCount: record.refillCount,
      configVersion: record.configVersion,
      lastMintTxHash: record.lastMintTxHash,
    };
  },
});

export const recordGrant = internalMutation({
  args: {
    walletAddress: v.string(),
    privySubject: v.string(),
    grantAmount: v.number(),
    configVersion: v.number(),
    grantedAt: v.number(),
    txHash: v.string(),
  },
  returns: v.id("starterGrants"),
  handler: async (ctx, args) => {
    const wallet = normalizeWalletAddress(args.walletAddress);
    const existing = await ctx.db
      .query("starterGrants")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", wallet))
      .unique();
    if (existing) {
      throw new Error("Starter Grant already recorded for this wallet");
    }
    return await ctx.db.insert("starterGrants", {
      walletAddress: wallet,
      privySubject: args.privySubject,
      grantedAt: args.grantedAt,
      grantAmount: args.grantAmount,
      lastRefillAt: null,
      refillCount: 0,
      configVersion: args.configVersion,
      lastMintTxHash: args.txHash,
    });
  },
});

export const recordRefill = internalMutation({
  args: {
    walletAddress: v.string(),
    privySubject: v.string(),
    refilledAt: v.number(),
    txHash: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const wallet = normalizeWalletAddress(args.walletAddress);
    const existing = await ctx.db
      .query("starterGrants")
      .withIndex("by_wallet", (q) => q.eq("walletAddress", wallet))
      .unique();
    if (!existing) {
      throw new Error("No Starter Grant to refill");
    }
    if (existing.privySubject !== args.privySubject) {
      throw new Error("Wallet grant belongs to a different account");
    }
    await ctx.db.patch(existing._id, {
      lastRefillAt: args.refilledAt,
      refillCount: existing.refillCount + 1,
      lastMintTxHash: args.txHash,
    });
    return null;
  },
});
