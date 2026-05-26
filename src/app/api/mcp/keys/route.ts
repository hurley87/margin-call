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
 * Privy-authenticated issuance of a fresh per-desk MCP API key.
 * The raw key is returned exactly once; only its HMAC hash is stored.
 * Requires a prior deskManager row (sign into the web app at least once).
 */
export async function POST(request: NextRequest) {
  if (!API_KEY_SECRET || !CONVEX_URL) {
    return NextResponse.json(
      { error: "MCP is not configured on this server (missing env)" },
      { status: 500 }
    );
  }

  let auth;
  try {
    auth = await verifyPrivyToken(request);
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const subject = canonicalPrivySubject(auth.claims.userId, auth.user.id);

  const convex = createConvexAdminClient();

  const dm = (await convex.query(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    internal.deskManagers.getBySubject as any,
    { subject }
  )) as { _id: Id<"deskManagers">; walletAddress?: string } | null;

  if (!dm) {
    return NextResponse.json(
      {
        error:
          "No desk found for your account. Visit the Margin Call web app, connect your wallet, and reload once so a deskManager row is created.",
      },
      { status: 400 }
    );
  }

  const rawKey = generateMcpKey();
  const keyHash = hashMcpKey(rawKey);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await convex.mutation(internal.mcpApiKeys.create as any, {
    keyHash,
    deskManagerId: dm._id,
  });

  return NextResponse.json({
    ok: true,
    key: rawKey,
    deskId: dm._id,
    note: "Store this key securely — it is shown only once. Use it as the Bearer token for /api/mcp/* endpoints and when configuring the @margin-call/mcp-server package.",
  });
}
