import { NextRequest } from "next/server";
import { proxyMcpWrite } from "@/lib/mcp/proxy";

/**
 * POST /api/mcp/deals/close
 * MCP write: close an MCP-desk-owned deal via the desk CDP wallet, then mark
 * the Convex row closed. Rejects when on-chain pending entries > 0.
 * Body: dealId, idempotencyKey.
 */
export async function POST(request: NextRequest) {
  return proxyMcpWrite(request, {
    convexAction: "deals/close",
    requireIdempotencyKey: true,
  });
}
