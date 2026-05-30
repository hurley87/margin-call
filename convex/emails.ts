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
const CIRCLE_FAUCET_URL = "https://faucet.circle.com/";

type SendWelcomeEmailResult =
  | { ok: false; status: "failed"; error?: string }
  | { ok: true; status: "sent"; resendId?: string }
  | { ok: true; status: "skipped" };

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

export function buildWelcomeEmail(args: { walletAddress?: string }) {
  const deskWalletLine =
    args.walletAddress?.trim() ||
    "(Open the desk and copy your desk wallet — it shows in Fund Wallet.)";
  const subject =
    "Welcome to the floor — fund your desk and hire your first trader";
  const text = [
    "THE WIRE IS OPEN.",
    "",
    "You are not here to click every trade. You are here to run a desk.",
    "",
    "STEP 1 — FUND THE DESK WALLET",
    "",
    `Send test USDC on Base Sepolia to your desk wallet address:`,
    deskWalletLine,
    "",
    `Use the Circle faucet (${CIRCLE_FAUCET_URL}) and choose Base Sepolia as the network.`,
    "",
    "STEP 2 — HIRE A TRADER",
    "",
    "Open Hire Trader. Name them. Dial mandate — risk appetite, oversight, style.",
    "",
    "STEP 3 — FUND THEIR ESCROW",
    "",
    "Stake USDC from your desk wallet so they can hit the wire.",
    "",
    "STEP 4 — ACTIVATE & WRITE DEALS",
    "",
    "NYSE hours: send them to the floor. Open The Wire, turn a headline into a funded deal, lure rival agents.",
    "",
    `OPEN THE TERMINAL: ${APP_URL}`,
    "",
    "Run the meanest desk on the street.",
    "",
    "— Margin Call",
  ].join("\n");

  const addr = args.walletAddress?.trim();
  const walletHtmlBlock = addr
    ? `<code style="word-break:break-all">${escapeHtml(addr)}</code>`
    : `<span style="opacity:0.85">${escapeHtml(deskWalletLine)}</span>`;

  const html = `
    <div style="font-family:ui-monospace,Consolas,Menlo,monospace;font-size:13px;line-height:1.55;color:#111;max-width:560px">
      <p style="letter-spacing:0.12em;font-weight:bold">THE WIRE IS OPEN.</p>
      <p>You are not here to click every trade. You are here to run a desk.</p>
      <p style="margin-top:1.25rem;letter-spacing:0.1em;font-weight:bold">STEP 1 — FUND THE DESK WALLET</p>
      <p>Send test USDC on <strong>Base Sepolia</strong> to your desk wallet:</p>
      <p>${walletHtmlBlock}</p>
      <p>Use the <a href="${CIRCLE_FAUCET_URL}" style="color:#15803d;font-weight:bold">Circle faucet</a> and choose <strong>Base Sepolia</strong>.</p>
      <p style="margin-top:1.25rem;letter-spacing:0.1em;font-weight:bold">STEP 2 — HIRE A TRADER</p>
      <p>Open <em>Hire Trader</em>. Name them. Set mandate: risk appetite, oversight, style.</p>
      <p style="margin-top:1.25rem;letter-spacing:0.1em;font-weight:bold">STEP 3 — FUND THEIR ESCROW</p>
      <p>Stake USDC from your desk wallet so they can hit the wire.</p>
      <p style="margin-top:1.25rem;letter-spacing:0.1em;font-weight:bold">STEP 4 — ACTIVATE &amp; WRITE DEALS</p>
      <p>During NYSE hours, send them to the floor. Open <em>The Wire</em>, turn a headline into a deal.</p>
      <p style="margin-top:1.5rem"><a href="${APP_URL}" style="display:inline-block;padding:10px 16px;background:#15803d;color:#fff;text-decoration:none;font-weight:bold;border-radius:2px">OPEN THE TERMINAL</a></p>
      <p style="margin-top:1rem;font-weight:bold">Run the meanest desk on the street.</p>
      <p style="opacity:0.7">— Margin Call</p>
    </div>
  `;

  return { subject, text, html };
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

async function sendWelcomeEmailMessage(args: {
  toEmail: string;
  walletAddress?: string;
}) {
  if (!isResendConfigured()) {
    return { status: "skipped" as const };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const message = buildWelcomeEmail({ walletAddress: args.walletAddress });
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

export const sendWelcomeEmail = internalAction({
  args: { deskManagerId: v.id("deskManagers") },
  handler: async (ctx, { deskManagerId }): Promise<SendWelcomeEmailResult> => {
    try {
      if (!isResendConfigured()) {
        return { ok: true as const, status: "skipped" as const };
      }

      const deskBeforeSend = await ctx.runQuery(
        internal.deskManagers.getByIdInternal,
        { id: deskManagerId }
      );
      if (
        !deskBeforeSend?.email ||
        deskBeforeSend.welcomeEmailSentAt !== undefined
      ) {
        return { ok: true as const, status: "skipped" as const };
      }

      const result = await sendWelcomeEmailMessage({
        toEmail: deskBeforeSend.email,
        walletAddress: deskBeforeSend.walletAddress,
      });
      if (result.status === "skipped") {
        return { ok: true as const, status: "skipped" as const };
      }

      await ctx.runMutation(internal.deskManagers.markWelcomeEmailSent, {
        deskManagerId,
      });
      return {
        ok: true as const,
        status: "sent" as const,
        resendId: result.resendId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Welcome email failed to send.", {
        deskManagerId,
        error: message,
      });
      return { ok: false as const, status: "failed" as const, error: message };
    }
  },
});

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

export const sendTestWelcomeEmail = action({
  args: {
    operatorSecret: v.optional(v.string()),
    toEmail: v.optional(v.string()),
    walletAddress: v.optional(v.string()),
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

    const result = await sendWelcomeEmailMessage({
      toEmail,
      walletAddress: args.walletAddress,
    });
    return { ok: true as const, ...result };
  },
});
