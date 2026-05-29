import { makeTraderIdRoute } from "@/lib/mcp/proxy";

/**
 * POST /api/mcp/traders/[id]/withdraw
 * MCP write: escrow withdraw to desk wallet, sync escrow balance.
 * Body: amountUsdc, idempotencyKey. (traderId is taken from the URL path.)
 */
export const POST = makeTraderIdRoute("traders/withdraw");
