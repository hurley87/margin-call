import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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

/** Creates or updates the deskManager row keyed on Privy subject. */
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
    const existing = await ctx.db
      .query("deskManagers")
      .withIndex("bySubject", (q) => q.eq("subject", identity.subject))
      .unique();

    if (existing) {
      const patch: Record<string, unknown> = { updatedAt: now };
      if (args.walletAddress !== undefined)
        patch.walletAddress = args.walletAddress;
      if (args.displayName !== undefined) patch.displayName = args.displayName;
      if (args.settings !== undefined) patch.settings = args.settings;
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("deskManagers", {
      subject: identity.subject,
      walletAddress: args.walletAddress,
      displayName: args.displayName,
      settings: args.settings ?? {},
      createdAt: now,
      updatedAt: now,
    });
  },
});
