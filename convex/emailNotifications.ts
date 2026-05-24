import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const getWipeoutContext = internalQuery({
  args: { notificationId: v.id("emailNotifications") },
  handler: async (ctx, { notificationId }) => {
    const notification = await ctx.db.get(notificationId);
    if (!notification) return null;
    const trader = await ctx.db.get(notification.traderId);
    return { notification, traderName: trader?.name ?? "Your trader" };
  },
});

export const markSent = internalMutation({
  args: {
    notificationId: v.id("emailNotifications"),
    resendId: v.optional(v.string()),
  },
  handler: async (ctx, { notificationId, resendId }) => {
    await ctx.db.patch(notificationId, {
      status: "sent",
      resendId,
      sentAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const markSkipped = internalMutation({
  args: {
    notificationId: v.id("emailNotifications"),
    reason: v.union(
      v.literal("missing_email"),
      v.literal("resend_unavailable")
    ),
  },
  handler: async (ctx, { notificationId, reason }) => {
    await ctx.db.patch(notificationId, {
      status: "skipped",
      reason,
      updatedAt: Date.now(),
    });
  },
});

export const markFailed = internalMutation({
  args: {
    notificationId: v.id("emailNotifications"),
    error: v.string(),
  },
  handler: async (ctx, { notificationId, error }) => {
    await ctx.db.patch(notificationId, {
      status: "failed",
      error,
      updatedAt: Date.now(),
    });
  },
});
