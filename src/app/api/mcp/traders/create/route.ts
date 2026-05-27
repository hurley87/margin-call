import { NextRequest } from "next/server";
import { proxyMcpWrite } from "@/lib/mcp/proxy";

/**
 * POST /api/mcp/traders/create
 * MCP write: full trader provisioning (ERC-8004 mint + CDP smart account), then
 * Convex row update. Requires `idempotencyKey` per request (24h replay cache
 * in Convex). Body: `name`, optional `mandate`, `personality`, `idempotencyKey`.
 */
export async function POST(request: NextRequest) {
  return proxyMcpWrite(request, {
    convexAction: "traders/create",
    requireIdempotencyKey: true,
  });
}
