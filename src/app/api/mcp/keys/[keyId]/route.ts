import { NextRequest, NextResponse } from "next/server";
import { verifyPrivyToken, canonicalPrivySubject } from "@/lib/privy/server";
import { createConvexAdminClient } from "@/lib/convex/server-client";
import { internal } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

/**
 * DELETE /api/mcp/keys/{keyId}
 * Privy-authenticated revocation of one of the caller's MCP keys.
 * Hard cut — the old key stops working on the very next request.
 * Idempotent: revoking an already-revoked key returns `alreadyRevoked: true`.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ keyId: string }> }
) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return NextResponse.json(
      { error: "MCP is not configured on this server" },
      { status: 500 }
    );
  }

  let revokedByPrivySubject: string;
  try {
    const { claims, user } = await verifyPrivyToken(request);
    revokedByPrivySubject = canonicalPrivySubject(claims.userId, user.id);
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { keyId } = await context.params;
  const convex = createConvexAdminClient();

  try {
    const result = (await convex.mutation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      internal.mcpApiKeys.revoke as any,
      {
        keyId: keyId as Id<"mcpApiKeys">,
        revokedByPrivySubject,
      }
    )) as {
      ok: true;
      alreadyRevoked: boolean;
      revokedAt: number;
      deskManagerId: Id<"deskManagers">;
    };
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to revoke key";
    const status = msg.includes("Not authorized")
      ? 403
      : msg.includes("not found")
        ? 404
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
