import { NextRequest } from "next/server";
import { proxyMcpRead } from "@/lib/mcp/proxy";

/**
 * GET /api/mcp/approvals
 * MCP read-only: pending high-stakes approvals for the desk with remaining TTL.
 * Query: ?limit=20
 */
export async function GET(request: NextRequest) {
  return proxyMcpRead(request, { convexAction: "approvals/pending" });
}
