import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  authorizeMcpServiceRequest,
  badRequest,
  jsonResponse,
  logMcpRequest,
  mcpReadRoute,
  mcpWriteRoute,
  mcpConfirmRoute,
  parseJsonBody,
  THIRTY_DAYS_MS,
} from "./mcp/httpHelpers";

/**
 * Convex HTTP router for server-to-server endpoints. Routes under /mcp/* are
 * called by the Next.js /api/mcp/* layer after it validates the end-user's
 * per-desk mc_live_* API key, and must present MCP_SERVICE_TOKEN. Never call
 * these directly from browsers or untrusted code.
 */

const http = httpRouter();

type McpWriteParseFail = { ok: false; message: string };
type McpWriteParseOk = {
  deskManagerId: Id<"deskManagers">;
  idempotencyKey: string;
  requestBody: Record<string, unknown>;
};

function parseMcpWriteBase(
  body: Record<string, unknown>
): McpWriteParseFail | McpWriteParseOk {
  if (typeof body.deskManagerId !== "string" || !body.deskManagerId) {
    return { ok: false, message: "deskManagerId required" };
  }
  if (
    typeof body.idempotencyKey !== "string" ||
    body.idempotencyKey.trim() === ""
  ) {
    return { ok: false, message: "idempotencyKey required" };
  }
  return {
    deskManagerId: body.deskManagerId as Id<"deskManagers">,
    idempotencyKey: body.idempotencyKey.trim(),
    requestBody: body,
  };
}

function parseTraderIdField(
  body: Record<string, unknown>
): { ok: false; message: string } | { ok: true; traderId: Id<"traders"> } {
  if (typeof body.traderId !== "string" || body.traderId.trim() === "") {
    return { ok: false, message: "traderId required" };
  }
  return { ok: true, traderId: body.traderId.trim() as Id<"traders"> };
}

function parseCreateTraderBody(body: Record<string, unknown>) {
  const base = parseMcpWriteBase(body);
  if ("ok" in base) return base;
  if (typeof body.name !== "string" || body.name.trim() === "") {
    return { ok: false as const, message: "name required" };
  }
  return {
    ok: true as const,
    parsed: {
      deskManagerId: base.deskManagerId,
      idempotencyKey: base.idempotencyKey,
      requestBody: base.requestBody,
    },
  };
}

function parseSetDeskWalletBody(body: Record<string, unknown>) {
  if (typeof body.deskManagerId !== "string" || !body.deskManagerId) {
    return { ok: false as const, message: "deskManagerId required" };
  }
  if (
    typeof body.walletAddress !== "string" ||
    body.walletAddress.trim() === ""
  ) {
    return { ok: false as const, message: "walletAddress required" };
  }
  return {
    ok: true as const,
    parsed: {
      deskManagerId: body.deskManagerId as Id<"deskManagers">,
      walletAddress: body.walletAddress.trim(),
    },
  };
}

function parseConfirmIntentBody(body: Record<string, unknown>) {
  if (typeof body.deskManagerId !== "string" || !body.deskManagerId) {
    return { ok: false as const, message: "deskManagerId required" };
  }
  if (typeof body.intentId !== "string" || body.intentId.trim() === "") {
    return { ok: false as const, message: "intentId required" };
  }
  if (typeof body.txHash !== "string" || body.txHash.trim() === "") {
    return { ok: false as const, message: "txHash required" };
  }
  const txHash = body.txHash.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return {
      ok: false as const,
      message: "txHash must be a 0x-prefixed 32-byte hex string",
    };
  }
  return {
    ok: true as const,
    parsed: {
      deskManagerId: body.deskManagerId as Id<"deskManagers">,
      intentId: body.intentId.trim() as Id<"mcpIntents">,
      txHash,
    },
  };
}

function parseConfigureTraderBody(body: Record<string, unknown>) {
  const base = parseMcpWriteBase(body);
  if ("ok" in base) return base;
  const tid = parseTraderIdField(body);
  if (!tid.ok) return tid;
  if (
    !body.mandate ||
    typeof body.mandate !== "object" ||
    Array.isArray(body.mandate)
  ) {
    return { ok: false as const, message: "mandate required (object)" };
  }
  return {
    ok: true as const,
    parsed: {
      deskManagerId: base.deskManagerId,
      idempotencyKey: base.idempotencyKey,
      requestBody: base.requestBody,
      traderId: tid.traderId,
    },
  };
}

function parseTraderLifecycleBody(body: Record<string, unknown>) {
  const base = parseMcpWriteBase(body);
  if ("ok" in base) return base;
  const tid = parseTraderIdField(body);
  if (!tid.ok) return tid;
  return {
    ok: true as const,
    parsed: {
      deskManagerId: base.deskManagerId,
      idempotencyKey: base.idempotencyKey,
      requestBody: base.requestBody,
      traderId: tid.traderId,
    },
  };
}

function parseFundTraderBody(body: Record<string, unknown>) {
  const base = parseTraderLifecycleBody(body);
  if (!base.ok) return base;
  const amountUsdc = Number(body.amountUsdc);
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    return {
      ok: false as const,
      message: "amountUsdc must be a positive number",
    };
  }
  return { ok: true as const, parsed: { ...base.parsed, amountUsdc } };
}

function parseWithdrawTraderBody(body: Record<string, unknown>) {
  return parseFundTraderBody(body);
}

function parseCreateDealBody(body: Record<string, unknown>) {
  const base = parseMcpWriteBase(body);
  if ("ok" in base) return base;
  if (typeof body.prompt !== "string" || body.prompt.trim() === "") {
    return { ok: false as const, message: "prompt required" };
  }
  const pot = Number(body.potUsdc);
  if (!Number.isFinite(pot) || pot <= 0) {
    return {
      ok: false as const,
      message: "potUsdc must be a positive number",
    };
  }
  const entryCost = Number(body.entryCostUsdc);
  if (!Number.isFinite(entryCost) || entryCost <= 0) {
    return {
      ok: false as const,
      message: "entryCostUsdc must be a positive number",
    };
  }
  if (entryCost > pot) {
    return {
      ok: false as const,
      message: "entryCostUsdc must be <= potUsdc",
    };
  }
  return {
    ok: true as const,
    parsed: {
      deskManagerId: base.deskManagerId,
      idempotencyKey: base.idempotencyKey,
      requestBody: base.requestBody,
    },
  };
}

function parseCloseDealBody(body: Record<string, unknown>) {
  const base = parseMcpWriteBase(body);
  if ("ok" in base) return base;
  if (typeof body.dealId !== "string" || body.dealId.trim() === "") {
    return { ok: false as const, message: "dealId required" };
  }
  return {
    ok: true as const,
    parsed: {
      deskManagerId: base.deskManagerId,
      idempotencyKey: base.idempotencyKey,
      requestBody: base.requestBody,
    },
  };
}

function parseAnswerApprovalBody(body: Record<string, unknown>) {
  const base = parseMcpWriteBase(body);
  if ("ok" in base) return base;
  if (typeof body.approvalId !== "string" || body.approvalId.trim() === "") {
    return { ok: false as const, message: "approvalId required" };
  }
  if (body.decision !== "approve" && body.decision !== "reject") {
    return {
      ok: false as const,
      message: 'decision must be "approve" or "reject"',
    };
  }
  return {
    ok: true as const,
    parsed: {
      deskManagerId: base.deskManagerId,
      idempotencyKey: base.idempotencyKey,
      requestBody: base.requestBody,
    },
  };
}

http.route({
  path: "/mcp/desks/get",
  method: "POST",
  handler: mcpReadRoute({
    tool: "get_desk",
    buildArgs: (body, startedAt) => ({
      deskManagerId: body.deskManagerId as Id<"deskManagers">,
      since: startedAt - THIRTY_DAYS_MS,
      now: startedAt,
    }),
    runQuery: (ctx, args) => ctx.runQuery(internal.mcp.desks.getState, args),
  }),
});

// sync_wallet: on-chain read in syncWalletFromChainForMcp ("use node" action).
http.route({
  path: "/mcp/desks/sync-wallet",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const authErr = authorizeMcpServiceRequest(req);
    if (authErr) return authErr;

    const body = await parseJsonBody<{
      deskManagerId?: string;
    }>(req);
    if (!body?.deskManagerId) return badRequest("deskManagerId required");

    const deskManagerId = body.deskManagerId as Id<"deskManagers">;
    const startedAt = Date.now();
    let errMsg: string | undefined;
    let balanceUsdc: number | undefined;
    let walletAddress: string | undefined;

    try {
      const result = await ctx.runAction(
        internal.mcp.deskWalletSync.syncWalletFromChainForMcp,
        { deskManagerId }
      );
      balanceUsdc = result.balanceUsdc;
      walletAddress = result.walletAddress;
    } catch (e: unknown) {
      errMsg = e instanceof Error ? e.message : String(e);
    }

    const durationMs = Date.now() - startedAt;
    await logMcpRequest(ctx, {
      deskManagerId,
      tool: "sync_wallet",
      durationMs,
      result: errMsg ? undefined : { balanceUsdc, walletAddress },
      error: errMsg,
      createdAt: startedAt,
    });

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
  path: "/mcp/traders/create",
  method: "POST",
  handler: mcpWriteRoute({
    tool: "create_trader",
    parseBody: parseCreateTraderBody,
    execute: async (ctx, { deskManagerId, requestBody }) => {
      try {
        const raw = await ctx.runAction(internal.mcp.traders.createForMcp, {
          deskManagerId,
          name: requestBody.name as string,
          mandate: requestBody.mandate,
          personality:
            typeof requestBody.personality === "string"
              ? requestBody.personality
              : undefined,
        });
        const { auditTxHash, ...result } = raw;
        return { result, txHash: auditTxHash };
      } catch (e: unknown) {
        return {
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },
  }),
});

http.route({
  path: "/mcp/traders/list",
  method: "POST",
  handler: mcpReadRoute({
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
  path: "/mcp/traders/check-name",
  method: "POST",
  handler: mcpReadRoute({
    tool: "check_trader_name",
    buildArgs: (body) => ({
      deskManagerId: body.deskManagerId as Id<"deskManagers">,
      name: typeof body.name === "string" ? body.name : "",
    }),
    runQuery: (ctx, args) =>
      ctx.runQuery(internal.mcp.traders.isNameAvailable, args),
  }),
});

http.route({
  path: "/mcp/deals/list",
  method: "POST",
  handler: mcpReadRoute({
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
  handler: mcpReadRoute({
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
  handler: mcpReadRoute({
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
  handler: mcpReadRoute({
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

http.route({
  path: "/mcp/desks/set-wallet",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const authErr = authorizeMcpServiceRequest(req);
    if (authErr) return authErr;

    const body = await parseJsonBody<Record<string, unknown>>(req);
    if (!body) return badRequest("Invalid JSON body");

    const parsed = parseSetDeskWalletBody(body);
    if (!parsed.ok) return badRequest(parsed.message);

    const startedAt = Date.now();
    let result: Record<string, unknown> | undefined;
    let errMsg: string | undefined;
    try {
      result = (await ctx.runMutation(internal.mcp.desks.setWalletForMcp, {
        deskManagerId: parsed.parsed.deskManagerId,
        walletAddress: parsed.parsed.walletAddress,
      })) as Record<string, unknown>;
    } catch (e: unknown) {
      errMsg = e instanceof Error ? e.message : String(e);
    }

    const durationMs = Date.now() - startedAt;
    await logMcpRequest(ctx, {
      deskManagerId: parsed.parsed.deskManagerId,
      tool: "set_desk_wallet",
      durationMs,
      result: errMsg ? undefined : result,
      error: errMsg,
      createdAt: startedAt,
    });

    return jsonResponse(
      errMsg ? { ok: false, error: errMsg } : { ok: true, ...result },
      errMsg ? 500 : 200
    );
  }),
});

http.route({
  path: "/mcp/traders/configure",
  method: "POST",
  handler: mcpWriteRoute({
    tool: "configure_trader",
    parseBody: parseConfigureTraderBody,
    execute: async (ctx, { deskManagerId, requestBody }) => {
      try {
        const result = await ctx.runMutation(
          internal.mcp.traders.configureForMcp,
          {
            deskManagerId,
            traderId: requestBody.traderId as Id<"traders">,
            mandate: requestBody.mandate,
            personality:
              requestBody.personality === null ||
              typeof requestBody.personality === "string"
                ? (requestBody.personality as string | null | undefined)
                : undefined,
          }
        );
        return { result };
      } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  }),
});

http.route({
  path: "/mcp/traders/fund",
  method: "POST",
  handler: mcpWriteRoute({
    tool: "fund_trader",
    parseBody: parseFundTraderBody,
    execute: async (ctx, { deskManagerId, requestBody, idempotencyKey }) => {
      try {
        const result = await ctx.runAction(
          internal.mcp.tradersEscrow.fundPrepareForMcp,
          {
            deskManagerId,
            traderId: requestBody.traderId as Id<"traders">,
            amountUsdc: Number(requestBody.amountUsdc),
            idempotencyKey,
          }
        );
        return { result: result as Record<string, unknown> };
      } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  }),
});

http.route({
  path: "/mcp/traders/resume",
  method: "POST",
  handler: mcpWriteRoute({
    tool: "resume_trader",
    parseBody: parseTraderLifecycleBody,
    execute: async (ctx, { deskManagerId, requestBody }) => {
      const now = Date.now();
      try {
        const result = await ctx.runMutation(
          internal.mcp.traders.resumeForMcp,
          {
            deskManagerId,
            traderId: requestBody.traderId as Id<"traders">,
            now,
          }
        );
        return { result };
      } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  }),
});

http.route({
  path: "/mcp/traders/pause",
  method: "POST",
  handler: mcpWriteRoute({
    tool: "pause_trader",
    parseBody: parseTraderLifecycleBody,
    execute: async (ctx, { deskManagerId, requestBody }) => {
      const now = Date.now();
      try {
        const result = await ctx.runMutation(internal.mcp.traders.pauseForMcp, {
          deskManagerId,
          traderId: requestBody.traderId as Id<"traders">,
          now,
        });
        return { result };
      } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  }),
});

http.route({
  path: "/mcp/traders/withdraw",
  method: "POST",
  handler: mcpWriteRoute({
    tool: "withdraw_from_trader",
    parseBody: parseWithdrawTraderBody,
    execute: async (ctx, { deskManagerId, requestBody, idempotencyKey }) => {
      try {
        const result = await ctx.runAction(
          internal.mcp.tradersEscrow.withdrawPrepareForMcp,
          {
            deskManagerId,
            traderId: requestBody.traderId as Id<"traders">,
            amountUsdc: Number(requestBody.amountUsdc),
            idempotencyKey,
          }
        );
        return { result: result as Record<string, unknown> };
      } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  }),
});

http.route({
  path: "/mcp/deals/create",
  method: "POST",
  handler: mcpWriteRoute({
    tool: "create_deal",
    parseBody: parseCreateDealBody,
    execute: async (ctx, { deskManagerId, requestBody, idempotencyKey }) => {
      try {
        const result = await ctx.runAction(
          internal.mcp.dealsEscrow.createPrepareForMcp,
          {
            deskManagerId,
            prompt: requestBody.prompt as string,
            potUsdc: Number(requestBody.potUsdc),
            entryCostUsdc: Number(requestBody.entryCostUsdc),
            idempotencyKey,
          }
        );
        return { result: result as Record<string, unknown> };
      } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  }),
});

http.route({
  path: "/mcp/deals/close",
  method: "POST",
  handler: mcpWriteRoute({
    tool: "close_deal",
    parseBody: parseCloseDealBody,
    execute: async (ctx, { deskManagerId, requestBody, idempotencyKey }) => {
      try {
        const result = await ctx.runAction(
          internal.mcp.dealsEscrow.closePrepareForMcp,
          {
            deskManagerId,
            dealId: requestBody.dealId as Id<"deals">,
            idempotencyKey,
          }
        );
        return { result: result as Record<string, unknown> };
      } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  }),
});

const CONFIRM_HANDLERS = {
  fund_trader: internal.mcp.tradersEscrow.fundConfirmForMcp,
  withdraw_from_trader: internal.mcp.tradersEscrow.withdrawConfirmForMcp,
  create_deal: internal.mcp.dealsEscrow.createConfirmForMcp,
  close_deal: internal.mcp.dealsEscrow.closeConfirmForMcp,
} as const;

http.route({
  path: "/mcp/intents/confirm",
  method: "POST",
  handler: mcpConfirmRoute({
    tool: "confirm_intent",
    parseBody: parseConfirmIntentBody,
    execute: async (ctx, { deskManagerId, intentId, txHash }) => {
      try {
        const intent = await ctx.runQuery(internal.mcp.intents.getForConfirm, {
          intentId,
          deskManagerId,
          now: Date.now(),
        });
        const type = intent.intent.intentType as keyof typeof CONFIRM_HANDLERS;
        const handler = CONFIRM_HANDLERS[type];
        if (!handler) {
          return { error: `Unknown intent type: ${type}` };
        }
        const result = (await ctx.runAction(handler, {
          deskManagerId,
          intentId,
          txHash,
        })) as Record<string, unknown>;
        return {
          result,
          txHash: (result.txHash as string | undefined) ?? txHash,
        };
      } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  }),
});

http.route({
  path: "/mcp/approvals/answer",
  method: "POST",
  handler: mcpWriteRoute({
    tool: "answer_approval",
    parseBody: parseAnswerApprovalBody,
    execute: async (ctx, { deskManagerId, requestBody }) => {
      try {
        const result = await ctx.runMutation(
          internal.mcp.approvals.answerForMcp,
          {
            deskManagerId,
            approvalId: requestBody.approvalId as Id<"dealApprovals">,
            decision: requestBody.decision as "approve" | "reject",
            reason:
              typeof requestBody.reason === "string"
                ? requestBody.reason
                : undefined,
            now: Date.now(),
          }
        );
        return { result };
      } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  }),
});

export default http;
