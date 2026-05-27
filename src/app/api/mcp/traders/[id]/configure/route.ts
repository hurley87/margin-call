import { NextRequest } from "next/server";
import { proxyMcpWrite } from "@/lib/mcp/proxy";

/**
 * POST /api/mcp/traders/[id]/configure
 * MCP write: update mandate + personality for an owned trader.
 * Body: traderId, mandate, optional personality, idempotencyKey.
 */
export async function POST(request: NextRequest) {
  return proxyMcpWrite(request, {
    convexAction: "traders/configure",
    requireIdempotencyKey: true,
  });
}
