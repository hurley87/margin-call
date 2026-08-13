"use node";

import { PrivyClient } from "@privy-io/server-auth";
import {
  extractPrivyPhoneNumber,
  isLosingTicket,
  MARGIN_CALL_LIQUIDATION_TWIML,
} from "@margin-call/shared/margin-call-voice";
import {
  createPublicClient,
  getAddress,
  http,
  parseAbi,
  type Address,
} from "viem";
import { baseSepolia } from "viem/chains";
import { v } from "convex/values";
import deployments from "../contracts/deployments/base_sepolia.json";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/** Mirrors MarginCallCrash ROUND_STATUS.finalized. */
const ROUND_STATUS_FINALIZED = 3;

const gameAbi = parseAbi([
  "function getRound(uint256 roundId) view returns ((uint256 id, uint64 openAt, uint64 lockAt, uint64 expiresAt, bytes32 crashRandom, uint256 crashPointBps, uint256 totalMargin, uint256 reservedPayout, uint8 status))",
  "function getTicket(uint256 ticketId) view returns ((uint256 id, address player, uint256 roundId, uint256 margin, uint256 leverageBps, uint256 reservedPayout, bool settled, bool claimed))",
]);

type SkipReason =
  | "not_opted_in"
  | "voice_disabled"
  | "missing_credentials"
  | "not_a_loss"
  | "player_mismatch"
  | "round_mismatch"
  | "no_phone"
  | "twilio_error";

function voiceEnabled() {
  return process.env.MARGIN_CALL_VOICE_ENABLED === "true";
}

function readTwilioConfig():
  | { ok: true; accountSid: string; authToken: string; from: string }
  | { ok: false } {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!accountSid || !authToken || !from) {
    return { ok: false };
  }
  return { ok: true, accountSid, authToken, from };
}

function readPrivyConfig():
  { ok: true; appId: string; appSecret: string } | { ok: false } {
  const appId = process.env.PRIVY_APP_ID?.trim();
  const appSecret = process.env.PRIVY_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    return { ok: false };
  }
  return { ok: true, appId, appSecret };
}

function gameAddress(): Address {
  const override = process.env.MARGIN_CALL_CRASH_ADDRESS?.trim();
  if (override) {
    return getAddress(override);
  }
  return getAddress(deployments.marginCallCrash);
}

function rpcUrl(): string | null {
  return (
    process.env.BASE_SEPOLIA_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL?.trim() ||
    null
  );
}

async function placeTwilioCall(args: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
}): Promise<{ ok: true; sid: string } | { ok: false }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${args.accountSid}/Calls.json`;
  const body = new URLSearchParams({
    To: args.to,
    From: args.from,
    Twiml: MARGIN_CALL_LIQUIDATION_TWIML,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${args.accountSid}:${args.authToken}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    // Do not log response body — it can echo the destination number.
    console.error("[margin-call] twilio_error status=", response.status);
    return { ok: false };
  }

  const json: unknown = await response.json();
  if (
    typeof json === "object" &&
    json !== null &&
    "sid" in json &&
    typeof (json as { sid: unknown }).sid === "string"
  ) {
    return { ok: true, sid: (json as { sid: string }).sid };
  }

  console.error("[margin-call] twilio_error missing_sid");
  return { ok: false };
}

/**
 * Place the promotional desk-phone call for a pending attempt.
 * Re-checks consent, verifies onchain loss, fetches phone from Privy at
 * call time, and never persists the number.
 */
export const placeCall = internalAction({
  args: {
    attemptId: v.id("marginCallAttempts"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const attempt = await ctx.runQuery(internal.marginCallStore.getAttempt, {
      attemptId: args.attemptId,
    });

    if (!attempt) {
      return null;
    }

    if (attempt.status !== "pending") {
      return null;
    }

    const skip = async (reason: SkipReason) => {
      await ctx.runMutation(internal.marginCallStore.markAttempt, {
        attemptId: args.attemptId,
        status: "skipped",
        reason,
      });
      return null;
    };

    if (!voiceEnabled()) {
      return await skip("voice_disabled");
    }

    const consent = await ctx.runQuery(
      internal.marginCallStore.getConsentByDid,
      {
        privyDid: attempt.privyDid,
      }
    );

    if (!consent || !consent.optedIn) {
      return await skip("not_opted_in");
    }

    const twilio = readTwilioConfig();
    const privy = readPrivyConfig();
    const rpc = rpcUrl();
    if (!twilio.ok || !privy.ok || !rpc) {
      return await skip("missing_credentials");
    }

    const client = createPublicClient({
      chain: baseSepolia,
      transport: http(rpc),
    });

    const ticketId = BigInt(attempt.ticketId);
    const roundId = BigInt(attempt.roundId);

    const [ticket, round] = await Promise.all([
      client.readContract({
        address: gameAddress(),
        abi: gameAbi,
        functionName: "getTicket",
        args: [ticketId],
      }),
      client.readContract({
        address: gameAddress(),
        abi: gameAbi,
        functionName: "getRound",
        args: [roundId],
      }),
    ]);

    if (ticket.roundId !== roundId) {
      return await skip("round_mismatch");
    }

    if (ticket.player.toLowerCase() !== attempt.walletAddress.toLowerCase()) {
      return await skip("player_mismatch");
    }

    if (
      round.status !== ROUND_STATUS_FINALIZED ||
      !isLosingTicket(ticket.leverageBps, round.crashPointBps)
    ) {
      return await skip("not_a_loss");
    }

    const privyClient = new PrivyClient(privy.appId, privy.appSecret);
    let phone: string | null = null;
    try {
      const user = await privyClient.getUser(attempt.privyDid);
      phone = extractPrivyPhoneNumber(user);
    } catch (error) {
      console.error(
        "[margin-call] privy_lookup_failed",
        error instanceof Error ? error.message : "unknown"
      );
      await ctx.runMutation(internal.marginCallStore.markAttempt, {
        attemptId: args.attemptId,
        status: "failed",
        reason: "no_phone",
      });
      return null;
    }

    if (!phone) {
      return await skip("no_phone");
    }

    // Re-check consent immediately before the Twilio POST so flipping the
    // switch off after scheduling still stops the call.
    const consentAgain = await ctx.runQuery(
      internal.marginCallStore.getConsentByDid,
      { privyDid: attempt.privyDid }
    );
    if (!consentAgain || !consentAgain.optedIn) {
      return await skip("not_opted_in");
    }

    const placed = await placeTwilioCall({
      accountSid: twilio.accountSid,
      authToken: twilio.authToken,
      from: twilio.from,
      to: phone,
    });

    // Drop the local phone reference; never log it.
    phone = null;

    if (!placed.ok) {
      await ctx.runMutation(internal.marginCallStore.markAttempt, {
        attemptId: args.attemptId,
        status: "failed",
        reason: "twilio_error",
      });
      return null;
    }

    await ctx.runMutation(internal.marginCallStore.markAttempt, {
      attemptId: args.attemptId,
      status: "placed",
      twilioCallSid: placed.sid,
    });

    return null;
  },
});
