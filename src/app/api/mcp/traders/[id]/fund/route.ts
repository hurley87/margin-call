import { NextRequest } from "next/server";
import { proxyMcpWrite } from "@/lib/mcp/proxy";

/**
 * POST /api/mcp/traders/[id]/fund
 * MCP write: approve USDC if needed, escrow depositFor, sync escrow balance.
 * Body: traderId, amountUsdc, idempotencyKey.
 */
export async function POST(request: NextRequest) {
  return proxyMcpWrite(request, {
    convexAction: "traders/fund",
    requireIdempotencyKey: true,
  });
}
