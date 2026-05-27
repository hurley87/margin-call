import { NextRequest, NextResponse } from "next/server";
import { verifyPrivyToken, canonicalPrivySubject } from "@/lib/privy/server";
import { createConvexAdminClient } from "@/lib/convex/server-client";
import { generateMcpKey, hashMcpKey } from "@/lib/mcp/keys";
import { getCdpClient } from "@/lib/cdp/client";
import { internal } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

const API_KEY_SECRET = process.env.MCP_API_KEY_SECRET;
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

/**
 * POST /api/mcp/keys
 * Privy-authenticated issuance of a fresh per-desk MCP API key (Phase 2+).
 * Provisions a dedicated CDP server wallet for the MCP credential and creates
 * an independent deskManager row with subject `mcp:cdp-wallet:<walletId>`.
 * The raw key is returned exactly once; only its HMAC hash is stored.
 * The issuing Privy identity is used only to gate creation (anti-spam); the
 * resulting MCP desk is a first-class autonomous identity.
 */
export async function POST(request: NextRequest) {
  if (!API_KEY_SECRET || !CONVEX_URL) {
    return NextResponse.json(
      { error: "MCP is not configured on this server (missing env)" },
      { status: 500 }
    );
  }

  let issuedByPrivySubject: string | undefined;
  try {
    const { claims, user } = await verifyPrivyToken(request);
    issuedByPrivySubject = canonicalPrivySubject(claims.userId, user.id);
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const convex = createConvexAdminClient();

  const rawKey = generateMcpKey();
  const keyHash = hashMcpKey(rawKey);

  // Phase 2: Provision a CDP server-managed EVM account (TEE key) for this
  // MCP credential. The account name + derived walletId become the stable
  // MCP desk identity.
  const cdp = getCdpClient();
  const walletId = keyHash.slice(0, 12);
  const cdpAccountName = `mcp-desk-${walletId}`;
  const account = await cdp.evm.getOrCreateAccount({ name: cdpAccountName });
  const walletAddress = account.address;

  const mcpSubject = `mcp:cdp-wallet:${walletId}`;

  // Create (or ensure) the independent MCP desk row. This is the first-class
  // owner for traders/deals created by this credential.
  const mcpDeskId = (await convex.mutation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    internal.deskManagers.createForMcp as any,
    { subject: mcpSubject, walletAddress, cdpAccountName }
  )) as Id<"deskManagers">;

  // Bind the one-time key to this MCP desk (not to the issuer's browser desk).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await convex.mutation(internal.mcpApiKeys.create as any, {
    keyHash,
    deskManagerId: mcpDeskId,
    issuedByPrivySubject,
  });

  return NextResponse.json({
    ok: true,
    key: rawKey,
    deskId: mcpDeskId,
    subject: mcpSubject,
    walletAddress,
    note: "Store this key securely — it is shown only once. This key now controls a dedicated AGENT DESK with its own CDP server wallet at the address above. Future withdrawal address registration will require a one-time Privy-authenticated web confirmation ceremony. Use the key as Bearer token for /api/mcp/* and with the margin-call MCP server in Claude Code.",
  });
}
