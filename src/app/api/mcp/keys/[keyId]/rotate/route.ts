import { NextRequest, NextResponse } from "next/server";
import { verifyPrivyToken, canonicalPrivySubject } from "@/lib/privy/server";
import { createConvexAdminClient } from "@/lib/convex/server-client";
import { generateMcpKey, hashMcpKey } from "@/lib/mcp/keys";
import { internal } from "../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../convex/_generated/dataModel";

/**
 * POST /api/mcp/keys/{keyId}/rotate
 * Privy-authenticated atomic rotation: revoke the old key and issue a new
 * one bound to the SAME deskManager (so wallet, traders, deals carry over).
 * Hard cut — the old key stops working immediately. The raw new key is
 * returned exactly once; only its HMAC hash is persisted in Convex.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ keyId: string }> }
) {
  if (!process.env.MCP_API_KEY_SECRET || !process.env.NEXT_PUBLIC_CONVEX_URL) {
    return NextResponse.json(
      { error: "MCP is not configured on this server (missing env)" },
      { status: 500 }
    );
  }

  let rotatedByPrivySubject: string;
  try {
    const { claims, user } = await verifyPrivyToken(request);
    rotatedByPrivySubject = canonicalPrivySubject(claims.userId, user.id);
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { keyId } = await context.params;

  const rawKey = generateMcpKey();
  const newKeyHash = hashMcpKey(rawKey);

  const convex = createConvexAdminClient();

  try {
    const result = (await convex.mutation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      internal.mcpApiKeys.rotate as any,
      {
        keyId: keyId as Id<"mcpApiKeys">,
        newKeyHash,
        rotatedByPrivySubject,
      }
    )) as {
      ok: true;
      newKeyId: Id<"mcpApiKeys">;
      deskManagerId: Id<"deskManagers">;
    };

    return NextResponse.json({
      ok: true,
      key: rawKey,
      keyId: result.newKeyId,
      deskId: result.deskManagerId,
      note: "Store this key securely — it is shown only once. The old key has been revoked and will be rejected on the next request. Update your MCP client (Claude Code, Cursor) with this new key before continuing.",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to rotate key";
    const status = msg.includes("Not authorized")
      ? 403
      : msg.includes("not found")
        ? 404
        : msg.includes("already-revoked")
          ? 409
          : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
