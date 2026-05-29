import { NextRequest } from "next/server";
import { proxyMcpWriteSimple } from "@/lib/mcp/proxy";

/**
 * POST /api/mcp/desks/set-wallet
 * Bind the agent's Base Account address to this MCP desk (BYO wallet).
 * Body: { walletAddress: "0x..." }
 */
export async function POST(request: NextRequest) {
  return proxyMcpWriteSimple(request, "desks/set-wallet");
}
