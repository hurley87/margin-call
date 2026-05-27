import { NextRequest } from "next/server";
import { proxyMcpWrite } from "@/lib/mcp/proxy";

/**
 * POST /api/mcp/desks/withdraw-to-address
 * MCP write: `USDC.transfer` from desk CDP EVM wallet to an allowlisted address only.
 * Rejects non-allowlisted destinations and amounts exceeding the per-desk daily cap.
 * Requires `idempotencyKey`. Returns txHash on success. Slow (on-chain).
 */
export async function POST(request: NextRequest) {
  return proxyMcpWrite(request, {
    convexAction: "desks/withdraw-to-address",
    requireIdempotencyKey: true,
  });
}
