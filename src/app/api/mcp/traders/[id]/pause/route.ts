import { makeTraderIdRoute } from "@/lib/mcp/proxy";

/**
 * POST /api/mcp/traders/[id]/pause
 * MCP write: pause an owned trader.
 * Body: idempotencyKey. (traderId is taken from the URL path.)
 */
export const POST = makeTraderIdRoute("traders/pause");
