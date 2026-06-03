import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { issueDeskSiweChallenge } from "@/lib/mcp/siwe";
import {
  checkRateLimit,
  getClientIdentifier,
  mcpIpLimit,
} from "@/lib/rate-limit";

/**
 * POST /api/mcp/keys/challenge
 * Issue a one-time SIWE message for MCP key creation (no Privy required).
 * Body: { address: "0x..." }
 */
export async function POST(request: NextRequest) {
  const ipLimited = await checkRateLimit(
    mcpIpLimit,
    getClientIdentifier(request)
  );
  if (ipLimited) return ipLimited;

  let body: { address?: string };
  try {
    body = (await request.json()) as { address?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { address } = body;
  if (!address || typeof address !== "string" || !isAddress(address)) {
    return NextResponse.json(
      { error: "address is required (valid 0x EVM address)" },
      { status: 400 }
    );
  }

  try {
    const challenge = await issueDeskSiweChallenge(getAddress(address));
    return NextResponse.json({
      ok: true,
      ...challenge,
      instructions:
        "Sign this message with Base MCP `sign` (personal_sign / EIP-191), then POST the message and signature to /api/mcp/keys to receive your mc_live_* key with the Base Account pre-bound as desk treasury.",
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to issue SIWE challenge";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
