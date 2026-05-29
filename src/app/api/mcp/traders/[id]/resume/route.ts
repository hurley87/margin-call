import { makeTraderIdRoute } from "@/lib/mcp/proxy";

/**
 * POST /api/mcp/traders/[id]/resume
 * MCP write: activate owned funded trader (wallet ready, market open).
 * Body: idempotencyKey. (traderId is taken from the URL path.)
 */
export const POST = makeTraderIdRoute("traders/resume");
