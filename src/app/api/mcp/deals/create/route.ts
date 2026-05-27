import { NextRequest } from "next/server";
import { proxyMcpWrite } from "@/lib/mcp/proxy";

/**
 * POST /api/mcp/deals/create
 * MCP write: approve USDC if needed + escrow createDeal via desk CDP wallet,
 * then record the on-chain deal in Convex.
 * Body: prompt, potUsdc, entryCostUsdc, idempotencyKey.
 */
export async function POST(request: NextRequest) {
  return proxyMcpWrite(request, {
    convexAction: "deals/create",
    requireIdempotencyKey: true,
  });
}
