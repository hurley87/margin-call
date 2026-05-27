import { httpRouter } from "convex/server";
import { httpAction, type ActionCtx } from "./_generated/server";
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
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function unauthorized() {
  return jsonResponse({ error: "forbidden" }, 403);
}

function badRequest(msg: string) {
  return jsonResponse({ error: msg }, 400);
}

async function parseJsonBody<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

type McpBody = {
  deskManagerId?: string;
  traderId?: string;
  limit?: number;
  includeClosed?: boolean;
};

type McpRouteSpec<R> = {
  tool: string;
  /** Build query args from request body + a server-side `startedAt`. */
  buildArgs: (body: McpBody, startedAt: number) => R;
  /** Invoke the underlying internal query. */
  runQuery: (ctx: ActionCtx, args: R) => Promise<unknown>;
};

function mcpRoute<R>(spec: McpRouteSpec<R>) {
  return httpAction(async (ctx, req) => {
    if (!SERVICE_TOKEN) return unauthorized();
    if (req.headers.get("authorization") !== `Bearer ${SERVICE_TOKEN}`) {
      return unauthorized();
    }

    const body = await parseJsonBody<McpBody>(req);
    if (!body?.deskManagerId) return badRequest("deskManagerId required");

    const deskManagerId = body.deskManagerId as Id<"deskManagers">;
    const startedAt = Date.now();
    const args = spec.buildArgs(body, startedAt);

    let result: unknown;
    let errMsg: string | undefined;
    try {
      result = await spec.runQuery(ctx, args);
    } catch (e: unknown) {
      errMsg = e instanceof Error ? e.message : String(e);
      result = { error: errMsg };
    }

    const durationMs = Date.now() - startedAt;
    try {
      await ctx.runMutation(internal.mcp.requests.log, {
        deskManagerId,
        tool: spec.tool,
        durationMs,
        result: errMsg ? undefined : result,
        error: errMsg,
        createdAt: startedAt,
      });
    } catch (logErr) {
      console.error("[mcp] failed to write mcpRequests log", logErr);
    }

    return jsonResponse(
      {
        ok: !errMsg,
        ...(errMsg ? { error: errMsg } : (result as Record<string, unknown>)),
      },
      errMsg ? 500 : 200
    );
  });
}

http.route({
  path: "/mcp/desks/get",
  method: "POST",
  handler: mcpRoute({
    tool: "get_desk",
    buildArgs: (body, startedAt) => ({
      deskManagerId: body.deskManagerId as Id<"deskManagers">,
      since: startedAt - THIRTY_DAYS_MS,
      now: startedAt,
    }),
    runQuery: (ctx, args) => ctx.runQuery(internal.mcp.desks.getState, args),
  }),
});

// sync_wallet: the on-chain read stays in the Next.js route (httpAction +
// "use node" unsupported per Convex). This handler receives the read result
// and performs only the internal sync + mcpRequests log (SERVICE_TOKEN),
// exactly like the other six /mcp/* tools.
http.route({
  path: "/mcp/desks/sync-wallet",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!SERVICE_TOKEN) return unauthorized();
    if (req.headers.get("authorization") !== `Bearer ${SERVICE_TOKEN}`) {
      return unauthorized();
    }

    const body = await parseJsonBody<{
      deskManagerId?: string;
      walletAddress?: string;
      balanceUsdc?: number;
    }>(req);
    if (!body?.deskManagerId) return badRequest("deskManagerId required");
    if (body.walletAddress === undefined || body.balanceUsdc === undefined) {
      return badRequest(
        "walletAddress and balanceUsdc required for sync_wallet"
      );
    }

    const deskManagerId = body.deskManagerId as Id<"deskManagers">;
    const walletAddress = body.walletAddress;
    const balanceUsdc = Number(body.balanceUsdc);

    const startedAt = Date.now();
    let errMsg: string | undefined;
    try {
      // Need subject for the existing syncWalletBalance internal (it keys on subject).
      // The wallet passed was just read for this desk; we still fetch to obtain subject.
      const dm = (await ctx.runQuery(internal.deskManagers.getByIdInternal, {
        id: deskManagerId,
      })) as { subject?: string } | null;
      if (!dm?.subject) {
        errMsg = "Desk not found for sync_wallet";
      } else {
        await ctx.runMutation(internal.deskManagers.syncWalletBalance, {
          subject: dm.subject,
          walletAddress,
          balanceUsdc,
          email: undefined,
        });
      }
    } catch (e: unknown) {
      errMsg = e instanceof Error ? e.message : String(e);
    }

    const durationMs = Date.now() - startedAt;
    try {
      await ctx.runMutation(internal.mcp.requests.log, {
        deskManagerId,
        tool: "sync_wallet",
        durationMs,
        result: errMsg ? undefined : { balanceUsdc, walletAddress },
        error: errMsg,
        createdAt: startedAt,
      });
    } catch (logErr) {
      console.error(
        "[mcp] failed to write mcpRequests log for sync_wallet",
        logErr
      );
    }

    return jsonResponse(
      {
        ok: !errMsg,
        ...(errMsg ? { error: errMsg } : { balanceUsdc, walletAddress }),
      },
      errMsg ? 500 : 200
    );
  }),
});

http.route({
  path: "/mcp/traders/list",
  method: "POST",
  handler: mcpRoute({
    tool: "list_traders",
    buildArgs: (body, startedAt) => ({
      deskManagerId: body.deskManagerId as Id<"deskManagers">,
      since: startedAt - THIRTY_DAYS_MS,
      limit: body.limit,
    }),
    runQuery: (ctx, args) => ctx.runQuery(internal.mcp.traders.list, args),
  }),
});

http.route({
  path: "/mcp/deals/list",
  method: "POST",
  handler: mcpRoute({
    tool: "list_deals",
    buildArgs: (body) => ({
      deskManagerId: body.deskManagerId as Id<"deskManagers">,
      limit: body.limit,
      includeClosed: body.includeClosed,
    }),
    runQuery: (ctx, args) => ctx.runQuery(internal.mcp.deals.list, args),
  }),
});

http.route({
  path: "/mcp/activity/get",
  method: "POST",
  handler: mcpRoute({
    tool: "get_activity",
    buildArgs: (body, startedAt) => ({
      deskManagerId: body.deskManagerId as Id<"deskManagers">,
      traderId: body.traderId as Id<"traders"> | undefined,
      since: startedAt - THIRTY_DAYS_MS,
      limit: body.limit,
    }),
    runQuery: (ctx, args) => ctx.runQuery(internal.mcp.activity.get, args),
  }),
});

http.route({
  path: "/mcp/outcomes/get",
  method: "POST",
  handler: mcpRoute({
    tool: "get_outcomes",
    buildArgs: (body, startedAt) => ({
      deskManagerId: body.deskManagerId as Id<"deskManagers">,
      traderId: body.traderId as Id<"traders"> | undefined,
      since: startedAt - THIRTY_DAYS_MS,
      limit: body.limit,
    }),
    runQuery: (ctx, args) => ctx.runQuery(internal.mcp.outcomes.get, args),
  }),
});

http.route({
  path: "/mcp/approvals/pending",
  method: "POST",
  handler: mcpRoute({
    tool: "get_pending_approvals",
    buildArgs: (body, startedAt) => ({
      deskManagerId: body.deskManagerId as Id<"deskManagers">,
      now: startedAt,
      limit: body.limit,
    }),
    runQuery: (ctx, args) =>
      ctx.runQuery(internal.mcp.approvals.getPending, args),
  }),
});

export default http;
