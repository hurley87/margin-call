import { NextRequest } from "next/server";
import { proxyMcpRead } from "@/lib/mcp/proxy";

/**
 * GET /api/mcp/desks
 * Thin MCP read surface (Phase 1). Validates a per-desk mc_live_* key via
 * shared proxy helper, then proxies to Convex HTTP action /mcp/desks/get.
 * Response includes wallet, balance, counts, recent P&L, pendingApprovals
 * (when available), and a funding-hint summary.
 */
export async function GET(request: NextRequest) {
  return proxyMcpRead(request, {
    convexAction: "desks/get",
  });
}
