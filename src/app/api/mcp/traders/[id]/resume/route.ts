import { NextRequest } from "next/server";
import { proxyMcpWrite } from "@/lib/mcp/proxy";

/**
 * POST /api/mcp/traders/[id]/resume
 * MCP write: activate owned funded trader (wallet ready, market open).
 * Body: traderId, idempotencyKey.
 */
export async function POST(request: NextRequest) {
  return proxyMcpWrite(request, {
    convexAction: "traders/resume",
    requireIdempotencyKey: true,
  });
}
