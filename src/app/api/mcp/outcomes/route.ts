import { NextRequest } from "next/server";
import { proxyMcpRead } from "@/lib/mcp/proxy";

/**
 * GET /api/mcp/outcomes
 * MCP read-only: recent deal outcomes + P&L, wipeouts, assets, tx hashes.
 * Query: ?traderId=...&limit=20
 */
export async function GET(request: NextRequest) {
  return proxyMcpRead(request, { convexAction: "outcomes/get" });
}
