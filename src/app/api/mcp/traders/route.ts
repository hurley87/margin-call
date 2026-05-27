import { NextRequest } from "next/server";
import { proxyMcpRead } from "@/lib/mcp/proxy";

/**
 * GET /api/mcp/traders
 * MCP read-only: list desk traders (status, token, escrow, mandate, recent P&L,
 * wallet, latest activity). Supports ?limit=20
 */
export async function GET(request: NextRequest) {
  return proxyMcpRead(request, { convexAction: "traders/list" });
}
