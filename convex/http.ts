import { httpRouter } from "convex/server";

/**
 * Convex HTTP router.
 *
 * MCP `/mcp/*` routes were removed with the Floor teardown. Keep an empty
 * router export so Convex still has a valid `http` module.
 */

const http = httpRouter();

export default http;
