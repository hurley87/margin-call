"use node";

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * Convex HTTP router for server-to-server endpoints. Routes under /mcp/* are
 * called by the Next.js /api/mcp/* layer after it validates the end-user's
 * per-desk mc_live_* API key, and must present MCP_SERVICE_TOKEN. Never call
 * these directly from browsers or untrusted code.
 */

const http = httpRouter();

const SERVICE_TOKEN = process.env.MCP_SERVICE_TOKEN ?? "";

http.route({
  path: "/mcp/desks/get",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const authHeader = req.headers.get("authorization") ?? "";
    if (!SERVICE_TOKEN || authHeader !== `Bearer ${SERVICE_TOKEN}`) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    let body: { deskManagerId?: string };
    try {
      body = (await req.json()) as { deskManagerId?: string };
    } catch {
      return new Response(JSON.stringify({ error: "bad_json" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const deskManagerIdStr = body.deskManagerId;
    if (!deskManagerIdStr) {
      return new Response(JSON.stringify({ error: "deskManagerId required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const deskManagerId = deskManagerIdStr as Id<"deskManagers">;

    const startedAt = Date.now();
    let result: unknown;
    let errMsg: string | undefined;

    try {
      // Compute `since` here so the internalQuery handler can stay pure (Convex
      // queries must not call Date.now()).
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      const since = startedAt - THIRTY_DAYS_MS;

      result = await ctx.runQuery(internal.mcp.desks.getState, {
        deskManagerId,
        since,
      });
    } catch (e: unknown) {
      errMsg = e instanceof Error ? e.message : String(e);
      result = { error: errMsg };
    }

    const durationMs = Date.now() - startedAt;

    try {
      await ctx.runMutation(internal.mcp.requests.log, {
        deskManagerId,
        tool: "get_desk",
        durationMs,
        result: errMsg ? undefined : result,
        error: errMsg,
        createdAt: startedAt,
      });
    } catch (logErr) {
      console.error("[mcp] failed to write mcpRequests log", logErr);
    }

    const status = errMsg ? 500 : 200;
    return new Response(
      JSON.stringify({
        ok: !errMsg,
        ...(errMsg ? { error: errMsg } : (result as Record<string, unknown>)),
      }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }),
});

export default http;
