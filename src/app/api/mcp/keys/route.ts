import { NextRequest, NextResponse } from "next/server";
import { verifyPrivyToken, canonicalPrivySubject } from "@/lib/privy/server";
import { createConvexAdminClient } from "@/lib/convex/server-client";
import { generateMcpKey, hashMcpKey } from "@/lib/mcp/keys";
import { internal } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

const API_KEY_SECRET = process.env.MCP_API_KEY_SECRET;
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

/**
 * POST /api/mcp/keys
 * Privy-authenticated issuance of a fresh per-desk MCP API key (Phase 2+).
 * Creates an independent deskManager row with subject `mcp:cdp-wallet:<walletId>`.
 * The agent binds its own Base Account via `set_desk_wallet` after connecting Base MCP.
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

  const walletId = keyHash.slice(0, 12);
  const mcpSubject = `mcp:cdp-wallet:${walletId}`;

  // Create (or ensure) the independent MCP desk row. Wallet address is bound
  // later via set_desk_wallet (agent's Base Account from Base MCP).
  const mcpDeskId = (await convex.mutation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    internal.deskManagers.createForMcp as any,
    { subject: mcpSubject }
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
    note: "Store this key securely — it is shown only once. Connect Base MCP (https://mcp.base.org), then call set_desk_wallet with your Base Account address before funding or hiring traders. Treasury writes (fund_trader, create_deal, etc.) use prepare → Base MCP send_calls (approve in Base Account) → confirm_intent. Use the key as Bearer token for /api/mcp/* and with the margin-call MCP server in Claude Code.",
  });
}
