import { NextRequest } from "next/server";
import { proxyMcpRead } from "@/lib/mcp/proxy";

/**
 * GET /api/mcp/activity
 * MCP read-only: recent activity (desk-wide or scoped to ?traderId=...).
 * Returns structured + `lines[]` pre-formatted for terminal.
 * Query: ?traderId=...&limit=30
 */
export async function GET(request: NextRequest) {
  return proxyMcpRead(request, { convexAction: "activity/get" });
}
