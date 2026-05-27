import { NextRequest } from "next/server";
import { proxyMcpRead } from "@/lib/mcp/proxy";

/**
 * GET /api/mcp/deals
 * MCP read-only: open deals with eligibility for the caller's desk traders.
 * Query: ?limit=30&includeClosed=true (rarely needed)
 */
export async function GET(request: NextRequest) {
  return proxyMcpRead(request, { convexAction: "deals/list" });
}
