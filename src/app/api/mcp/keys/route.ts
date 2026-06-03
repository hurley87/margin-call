import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "viem";
import { createConvexAdminClient } from "@/lib/convex/server-client";
import { generateMcpKey, hashMcpKey } from "@/lib/mcp/keys";
import { mcpBaseSubject, verifyDeskSiwe } from "@/lib/mcp/siwe";
import {
  checkRateLimit,
  getClientIdentifier,
  mcpIpLimit,
} from "@/lib/rate-limit";
import { internal } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

const API_KEY_SECRET = process.env.MCP_API_KEY_SECRET;
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

/**
 * POST /api/mcp/keys
 *
 * SIWE-gated MCP desk key issuance. Body: { message, signature } from a
 * challenge issued by POST /api/mcp/keys/challenge. The signing Base Account
 * becomes the desk treasury (`mcp:base:<address>`); any prior key bound to
 * that desk is revoked atomically before the new one is inserted, so a
 * re-issued SIWE handshake is the recovery path for a lost or compromised key.
 */
export async function POST(request: NextRequest) {
  if (!API_KEY_SECRET || !CONVEX_URL) {
    return NextResponse.json(
      { error: "MCP is not configured on this server (missing env)" },
      { status: 500 }
    );
  }

  const ipLimited = await checkRateLimit(
    mcpIpLimit,
    getClientIdentifier(request)
  );
  if (ipLimited) return ipLimited;

  let body: { message?: string; signature?: string };
  try {
    body = (await request.json()) as { message?: string; signature?: string };
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body. Expected { message, signature }." },
      { status: 400 }
    );
  }

  const message = body.message?.trim();
  const signature = body.signature?.trim();
  if (!message || !signature) {
    return NextResponse.json(
      {
        error:
          "Missing SIWE fields. Body must be { message, signature } from POST /api/mcp/keys/challenge.",
      },
      { status: 400 }
    );
  }

  const verification = await verifyDeskSiwe({ message, signature });
  if (!verification.valid) {
    return NextResponse.json(
      { error: verification.error ?? "SIWE verification failed" },
      { status: 401 }
    );
  }

  const address = verification.address;
  const mcpSubject = mcpBaseSubject(address);

  const convex = createConvexAdminClient();
  const rawKey = generateMcpKey();
  const keyHash = hashMcpKey(rawKey);

  const mcpDeskId = (await convex.mutation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    internal.deskManagers.createForMcp as any,
    { subject: mcpSubject, walletAddress: getAddress(address) }
  )) as Id<"deskManagers">;

  await convex.mutation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    internal.mcpApiKeys.create as any,
    { keyHash, deskManagerId: mcpDeskId }
  );

  return NextResponse.json({
    ok: true,
    key: rawKey,
    deskId: mcpDeskId,
    subject: mcpSubject,
    walletAddress: address,
    note: "Store this key securely — it is shown only once and any previous key for this Base Account has been revoked. Your Base Account is bound as the desk treasury. Fund it with USDC on Base Sepolia, then sync_wallet before hiring traders. Treasury writes use prepare → Base MCP send_calls → confirm_intent. To rotate or recover a lost key, repeat the SIWE handshake — the new key supersedes the old one.",
  });
}
