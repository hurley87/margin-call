import { NextRequest } from "next/server";
import { proxyMcpConfirm } from "@/lib/mcp/proxy";

/**
 * POST /api/mcp/intents/confirm
 * Confirm a prepared treasury intent after Base MCP send_calls + approval.
 * Body: { intentId, txHash }
 */
export async function POST(request: NextRequest) {
  return proxyMcpConfirm(request, { convexAction: "intents/confirm" });
}
