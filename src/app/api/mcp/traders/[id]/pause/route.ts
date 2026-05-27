import { NextRequest } from "next/server";
import { proxyMcpWrite } from "@/lib/mcp/proxy";

/**
 * POST /api/mcp/traders/[id]/pause
 * MCP write: pause an owned trader.
 * Body: traderId, idempotencyKey.
 */
export async function POST(request: NextRequest) {
  return proxyMcpWrite(request, {
    convexAction: "traders/pause",
    requireIdempotencyKey: true,
  });
}
