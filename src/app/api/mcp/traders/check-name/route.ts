import { NextRequest } from "next/server";
import { proxyMcpRead } from "@/lib/mcp/proxy";

/**
 * GET /api/mcp/traders/check-name?name=<handle>
 * MCP read-only: validate trader handle format and global availability
 * before create_trader.
 */
export async function GET(request: NextRequest) {
  return proxyMcpRead(request, { convexAction: "traders/check-name" });
}
