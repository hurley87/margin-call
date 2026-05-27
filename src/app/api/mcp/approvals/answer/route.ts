import { NextRequest } from "next/server";
import { proxyMcpWrite } from "@/lib/mcp/proxy";

/**
 * POST /api/mcp/approvals/answer
 * MCP write: approve or reject a pending high-stakes deal approval for a
 * trader owned by this desk. Ownership is enforced server-side. Requires
 * `idempotencyKey`; the 24h MCP request cache replays identical retries
 * without re-running the mutation.
 */
export async function POST(request: NextRequest) {
  return proxyMcpWrite(request, {
    convexAction: "approvals/answer",
    requireIdempotencyKey: true,
  });
}
