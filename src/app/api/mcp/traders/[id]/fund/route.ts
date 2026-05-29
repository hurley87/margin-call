import { makeTraderIdRoute } from "@/lib/mcp/proxy";

/**
 * POST /api/mcp/traders/[id]/fund
 * MCP write: approve USDC if needed, escrow depositFor, sync escrow balance.
 * Body: amountUsdc, idempotencyKey. (traderId is taken from the URL path.)
 */
export const POST = makeTraderIdRoute("traders/fund");
