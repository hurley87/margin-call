import { httpAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

export type McpIntentId = Id<"mcpIntents">;

export const SERVICE_TOKEN = process.env.MCP_SERVICE_TOKEN ?? "";
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function unauthorized() {
  return jsonResponse({ error: "forbidden" }, 403);
}

export function badRequest(msg: string) {
  return jsonResponse({ error: msg }, 400);
}

/** Length-independent constant-time string compare (no Node crypto in runtime). */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function authorizeMcpServiceRequest(req: Request): Response | null {
  if (!SERVICE_TOKEN) return unauthorized();
  const header = req.headers.get("authorization") ?? "";
  if (!constantTimeEquals(header, `Bearer ${SERVICE_TOKEN}`)) {
    return unauthorized();
  }
  return null;
}

export async function parseJsonBody<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

type LogMcpRequestArgs = {
  deskManagerId: Id<"deskManagers">;
  tool: string;
  durationMs: number;
  createdAt: number;
  requestBody?: unknown;
  /** Omit on idempotent replay rows so cache lookup stays stable. */
  idempotencyKey?: string;
  result?: unknown;
  error?: string;
  txHash?: string;
};

export async function logMcpRequest(ctx: ActionCtx, args: LogMcpRequestArgs) {
  try {
    await ctx.runMutation(internal.mcp.requests.log, args);
  } catch (logErr) {
    console.error(
      `[mcp] failed to write mcpRequests log (${args.tool})`,
      logErr
    );
  }
}

export type McpWriteExecuteResult = {
  result?: Record<string, unknown>;
  error?: string;
  txHash?: string;
};

export type McpWriteParsedBody = {
  deskManagerId: Id<"deskManagers">;
  idempotencyKey: string;
  requestBody: Record<string, unknown>;
};

export type McpWriteRouteSpec = {
  tool: string;
  parseBody: (
    body: Record<string, unknown>
  ) =>
    | { ok: true; parsed: McpWriteParsedBody }
    | { ok: false; message: string };
  execute: (
    ctx: ActionCtx,
    parsed: McpWriteParsedBody
  ) => Promise<McpWriteExecuteResult>;
};

export function mcpWriteRoute(spec: McpWriteRouteSpec) {
  return httpAction(async (ctx, req) => {
    const authErr = authorizeMcpServiceRequest(req);
    if (authErr) return authErr;

    const raw = await parseJsonBody<Record<string, unknown>>(req);
    if (!raw) return badRequest("Invalid JSON body");

    const parsedBody = spec.parseBody(raw);
    if (!parsedBody.ok) return badRequest(parsedBody.message);

    const { deskManagerId, idempotencyKey, requestBody } = parsedBody.parsed;
    const startedAt = Date.now();
    const minCreatedAt = startedAt - IDEMPOTENCY_TTL_MS;

    const cached = await ctx.runQuery(internal.mcp.requests.findRecentByKey, {
      deskManagerId,
      idempotencyKey,
      tool: spec.tool,
      minCreatedAt,
    });

    if (cached?.result !== undefined && cached.result !== null) {
      const durationMs = Date.now() - startedAt;
      const cachedResult =
        typeof cached.result === "object" &&
        cached.result !== null &&
        !Array.isArray(cached.result)
          ? (cached.result as Record<string, unknown>)
          : { value: cached.result };

      await logMcpRequest(ctx, {
        deskManagerId,
        tool: spec.tool,
        requestBody,
        result: { ...cachedResult, cached: true },
        durationMs,
        txHash: cached.txHash,
        createdAt: startedAt,
      });

      return jsonResponse({ ok: true, ...cachedResult, cached: true }, 200);
    }

    if (cached?.error) {
      const durationMs = Date.now() - startedAt;
      await logMcpRequest(ctx, {
        deskManagerId,
        tool: spec.tool,
        requestBody,
        error: cached.error,
        durationMs,
        createdAt: startedAt,
      });
      return jsonResponse({ ok: false, error: cached.error }, 500);
    }

    const outcome = await spec.execute(ctx, parsedBody.parsed);
    const durationMs = Date.now() - startedAt;

    await logMcpRequest(ctx, {
      deskManagerId,
      tool: spec.tool,
      requestBody,
      idempotencyKey,
      result: outcome.error ? undefined : outcome.result,
      error: outcome.error,
      durationMs,
      txHash: outcome.txHash,
      createdAt: startedAt,
    });

    if (outcome.error) {
      return jsonResponse({ ok: false, error: outcome.error }, 500);
    }
    return jsonResponse({ ok: true, ...outcome.result }, 200);
  });
}

export type McpConfirmParsedBody = {
  deskManagerId: Id<"deskManagers">;
  intentId: McpIntentId;
  txHash: string;
};

export type McpConfirmRouteSpec = {
  tool: string;
  parseBody: (
    body: Record<string, unknown>
  ) =>
    | { ok: true; parsed: McpConfirmParsedBody }
    | { ok: false; message: string };
  execute: (
    ctx: ActionCtx,
    parsed: McpConfirmParsedBody
  ) => Promise<McpWriteExecuteResult>;
};

/** Confirm treasury intents after Base MCP execution (no idempotency key). */
export function mcpConfirmRoute(spec: McpConfirmRouteSpec) {
  return httpAction(async (ctx, req) => {
    const authErr = authorizeMcpServiceRequest(req);
    if (authErr) return authErr;

    const raw = await parseJsonBody<Record<string, unknown>>(req);
    if (!raw) return badRequest("Invalid JSON body");

    const parsedBody = spec.parseBody(raw);
    if (!parsedBody.ok) return badRequest(parsedBody.message);

    const { deskManagerId, intentId, txHash } = parsedBody.parsed;
    const startedAt = Date.now();

    const outcome = await spec.execute(ctx, parsedBody.parsed);
    const durationMs = Date.now() - startedAt;

    await logMcpRequest(ctx, {
      deskManagerId,
      tool: spec.tool,
      requestBody: { intentId, txHash },
      result: outcome.error ? undefined : outcome.result,
      error: outcome.error,
      durationMs,
      txHash: outcome.txHash ?? txHash,
      createdAt: startedAt,
    });

    if (outcome.error) {
      return jsonResponse({ ok: false, error: outcome.error }, 500);
    }
    return jsonResponse({ ok: true, phase: "confirm", ...outcome.result }, 200);
  });
}

export type McpReadBody = {
  deskManagerId?: string;
  traderId?: string;
  limit?: number;
  includeClosed?: boolean;
  name?: string;
};

export type McpReadRouteSpec<R> = {
  tool: string;
  buildArgs: (body: McpReadBody, startedAt: number) => R;
  runQuery: (ctx: ActionCtx, args: R) => Promise<unknown>;
};

export function mcpReadRoute<R>(spec: McpReadRouteSpec<R>) {
  return httpAction(async (ctx, req) => {
    const authErr = authorizeMcpServiceRequest(req);
    if (authErr) return authErr;

    const body = await parseJsonBody<McpReadBody>(req);
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
    await logMcpRequest(ctx, {
      deskManagerId,
      tool: spec.tool,
      durationMs,
      result: errMsg ? undefined : result,
      error: errMsg,
      createdAt: startedAt,
    });

    return jsonResponse(
      {
        ok: !errMsg,
        ...(errMsg ? { error: errMsg } : (result as Record<string, unknown>)),
      },
      errMsg ? 500 : 200
    );
  });
}
