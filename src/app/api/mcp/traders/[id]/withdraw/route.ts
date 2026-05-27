import { NextRequest } from "next/server";
import { proxyMcpWrite } from "@/lib/mcp/proxy";

/**
 * POST /api/mcp/traders/[id]/withdraw
 * MCP write: escrow withdraw to desk wallet, sync escrow balance.
 * Body: traderId, amountUsdc, idempotencyKey.
 */
export async function POST(request: NextRequest) {
  return proxyMcpWrite(request, {
    convexAction: "traders/withdraw",
    requireIdempotencyKey: true,
  });
}
