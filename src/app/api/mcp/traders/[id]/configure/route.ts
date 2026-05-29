import { makeTraderIdRoute } from "@/lib/mcp/proxy";

/**
 * POST /api/mcp/traders/[id]/configure
 * MCP write: update mandate + personality for an owned trader.
 * Body: mandate, optional personality, idempotencyKey. (traderId is taken from the URL path.)
 */
export const POST = makeTraderIdRoute("traders/configure");
