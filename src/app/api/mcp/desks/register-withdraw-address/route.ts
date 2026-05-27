import { NextRequest } from "next/server";
import { proxyMcpWrite } from "@/lib/mcp/proxy";

/**
 * POST /api/mcp/desks/register-withdraw-address
 * MCP write: submit a destination to the per-desk withdrawal allowlist.
 * First registration per desk requires a one-time web UI Privy ceremony
 * (binding the human issuer to the MCP desk). Subsequent adds are allowed
 * post-ceremony. Requires `idempotencyKey`.
 */
export async function POST(request: NextRequest) {
  return proxyMcpWrite(request, {
    convexAction: "desks/register-withdraw-address",
    requireIdempotencyKey: true,
  });
}
