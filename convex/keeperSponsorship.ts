import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/** Rolling window used for paymaster failure/spend alerts (ms). */
const SPONSORSHIP_WINDOW_MS = 60 * 60 * 1000;

/**
 * Record a Privy sponsorship failure or spend sample.
 * Alerts never gate settlement — the keeper only monitors.
 */
export const reportSponsorshipEvent = internalMutation({
  args: {
    kind: v.union(v.literal("failure"), v.literal("spend")),
    observedAt: v.number(),
    amountWei: v.optional(v.string()),
    detail: v.optional(v.string()),
  },
  returns: v.id("keeperSponsorshipEvents"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("keeperSponsorshipEvents", {
      kind: args.kind,
      observedAt: args.observedAt,
      amountWei: args.amountWei,
      detail: args.detail,
    });
  },
});

export const getSponsorshipWindowSample = internalQuery({
  args: {
    now: v.number(),
  },
  returns: v.object({
    failuresInWindow: v.number(),
    spendWeiInWindow: v.string(),
  }),
  handler: async (ctx, args) => {
    const since = args.now - SPONSORSHIP_WINDOW_MS;
    const events = await ctx.db
      .query("keeperSponsorshipEvents")
      .withIndex("by_observedAt", (q) => q.gte("observedAt", since))
      .take(500);

    let failuresInWindow = 0;
    let spendWei = 0n;
    for (const event of events) {
      if (event.kind === "failure") {
        failuresInWindow += 1;
      } else if (event.kind === "spend" && event.amountWei) {
        try {
          spendWei += BigInt(event.amountWei);
        } catch {
          // ignore malformed samples
        }
      }
    }

    return {
      failuresInWindow,
      spendWeiInWindow: spendWei.toString(),
    };
  },
});
