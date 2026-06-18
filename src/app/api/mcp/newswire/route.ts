import { NextRequest } from "next/server";
import { proxyMcpRead } from "@/lib/mcp/proxy";

/**
 * GET /api/mcp/newswire
 * MCP read-only: recent newswire posts (wire deal seeds) the desk can create a
 * deal against. Each carries a suggested prompt + pot/entry economics.
 * Query: ?limit=20
 */
export async function GET(request: NextRequest) {
  return proxyMcpRead(request, { convexAction: "newswire/list" });
}
