"use node";

import { Resend } from "resend";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { assertOperatorSubject } from "./wire/_operatorUtils";
import { normalizeEmail } from "../src/lib/email";

const FROM_EMAIL = "Margin Call <admin@margincall.fun>";
const APP_URL = "https://margincall.fun";

type SendWipeoutEmailResult =
  | { ok: false; status: "missing" | "failed" }
  | { ok: true; status: "pending" | "sent" | "skipped" };

type WipeoutNotificationContext = {
  notification: Doc<"emailNotifications">;
  traderName: string;
} | null;

export function isResendConfigured(apiKey = process.env.RESEND_API_KEY) {
  return typeof apiKey === "string" && apiKey.trim().length > 0;
}

function buildWipeoutEmail(args: { traderName: string }) {
  const subject = `Margin call: ${args.traderName} has been wiped out`;
  const text = [
    "The phones are ringing off the hook.",
    "",
    `${args.traderName} just hit the wall and has been wiped out. The account is flat, the position is gone, and the desk needs your attention.`,
    "",
    `Return to the floor: ${APP_URL}`,
    "",
    "Margin Call",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <p>The phones are ringing off the hook.</p>
      <p><strong>${escapeHtml(args.traderName)}</strong> just hit the wall and has been wiped out. The account is flat, the position is gone, and the desk needs your attention.</p>
      <p><a href="${APP_URL}" style="color:#7f1d1d;font-weight:bold">Return to the floor</a></p>
      <p>Margin Call</p>
    </div>
  `;
  return { subject, text, html };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function sendWipeoutEmailMessage(args: {
  toEmail: string;
  traderName: string;
}) {
  if (!isResendConfigured()) {
    return {
      status: "skipped" as const,
      reason: "resend_unavailable" as const,
    };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const message = buildWipeoutEmail({ traderName: args.traderName });
  const result = await resend.emails.send({
    from: FROM_EMAIL,
    to: args.toEmail,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return { status: "sent" as const, resendId: result.data?.id };
}

export const sendWipeoutEmail = internalAction({
  args: { notificationId: v.id("emailNotifications") },
  handler: async (ctx, { notificationId }): Promise<SendWipeoutEmailResult> => {
    const context: WipeoutNotificationContext = await ctx.runQuery(
      internal.emailNotifications.getWipeoutContext,
      { notificationId }
    );
    if (!context) return { ok: false as const, status: "missing" as const };

    const { notification, traderName } = context;
    if (notification.status === "failed") {
      return { ok: false as const, status: "failed" as const };
    }
    if (notification.status !== "pending") {
      return { ok: true as const, status: notification.status };
    }
    if (!notification.toEmail) {
      await ctx.runMutation(internal.emailNotifications.markSkipped, {
        notificationId,
        reason: "missing_email",
      });
      console.warn(
        "Wipeout email not sent because the desk manager has no email.",
        { notificationId }
      );
      return { ok: true as const, status: "skipped" as const };
    }

    try {
      const result = await sendWipeoutEmailMessage({
        toEmail: notification.toEmail,
        traderName,
      });
      if (result.status === "skipped") {
        await ctx.runMutation(internal.emailNotifications.markSkipped, {
          notificationId,
          reason: result.reason,
        });
        console.warn(
          "Wipeout email was not sent because Resend is unavailable.",
          { notificationId }
        );
        return { ok: true as const, status: "skipped" as const };
      }

      await ctx.runMutation(internal.emailNotifications.markSent, {
        notificationId,
        resendId: result.resendId,
      });
      return { ok: true as const, status: "sent" as const };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.emailNotifications.markFailed, {
        notificationId,
        error: message,
      });
      console.error("Wipeout email failed to send.", {
        notificationId,
        error: message,
      });
      return { ok: false as const, status: "failed" as const };
    }
  },
});

export const sendTestWipeoutEmail = action({
  args: {
    operatorSecret: v.optional(v.string()),
    toEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    let toEmail = normalizeEmail(args.toEmail);

    if (identity) {
      assertOperatorSubject(identity.subject);

      if (!toEmail) {
        const desk = await ctx.runQuery(internal.deskManagers.getBySubject, {
          subject: identity.subject,
        });
        toEmail = normalizeEmail(desk?.email ?? identity.email);
      }
    } else {
      const expectedSecret = process.env.OPERATOR_SECRET?.trim();
      if (!expectedSecret || args.operatorSecret !== expectedSecret) {
        throw new Error("Unauthenticated");
      }
      if (!toEmail) {
        throw new Error("toEmail is required when running without Privy auth");
      }
    }

    if (!toEmail) {
      return {
        ok: true as const,
        status: "skipped" as const,
        reason: "missing_email" as const,
      };
    }

    const result = await sendWipeoutEmailMessage({
      toEmail,
      traderName: "Test Trader",
    });
    return { ok: true as const, ...result };
  },
});
