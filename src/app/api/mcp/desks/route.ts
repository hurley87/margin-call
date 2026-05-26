import { NextRequest, NextResponse } from "next/server";
import { createConvexAdminClient } from "@/lib/convex/server-client";
import { hashMcpKey, MCP_KEY_PREFIX } from "@/lib/mcp/keys";
import { internal } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

const API_KEY_SECRET = process.env.MCP_API_KEY_SECRET;
const SERVICE_TOKEN = process.env.MCP_SERVICE_TOKEN;
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

const BEARER_RE = new RegExp(`^Bearer (${MCP_KEY_PREFIX}[A-Za-z0-9_-]+)$`);

/**
 * GET /api/mcp/desks
 * Thin MCP read surface (Phase 1). Validates a per-desk mc_live_* key,
 * then proxies (after service-token auth) to the Convex HTTP action
 * /mcp/desks/get which returns wallet, balance, counts, recent P&L and
 * a funding-hint summary.
 */
export async function GET(request: NextRequest) {
  if (!API_KEY_SECRET || !SERVICE_TOKEN || !CONVEX_URL) {
    return NextResponse.json(
      { error: "MCP is not configured on this server" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const match = BEARER_RE.exec(authHeader);
  if (!match) {
    return NextResponse.json(
      {
        error:
          "Missing or malformed Authorization header. Expected: Bearer mc_live_...",
      },
      { status: 401 }
    );
  }

  const keyHash = hashMcpKey(match[1]);

  const convex = createConvexAdminClient();

  const mapping = (await convex.query(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    internal.mcpApiKeys.lookupDeskByKeyHash as any,
    { keyHash }
  )) as { deskManagerId: Id<"deskManagers"> } | null;

  if (!mapping?.deskManagerId) {
    return NextResponse.json(
      { error: "Invalid or revoked MCP API key" },
      { status: 401 }
    );
  }

  const deskManagerId = mapping.deskManagerId;

  void convex
    .mutation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      internal.mcpApiKeys.touchLastUsed as any,
      { keyHash }
    )
    .catch(() => {
      /* ignore */
    });

  const mcpActionUrl = `${CONVEX_URL.replace(/\/$/, "")}/mcp/desks/get`;

  let upstream: Response;
  const started = Date.now();
  try {
    upstream = await fetch(mcpActionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_TOKEN}`,
      },
      body: JSON.stringify({ deskManagerId: String(deskManagerId) }),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "network error";
    return NextResponse.json(
      { error: "MCP upstream unavailable", detail: msg },
      { status: 502 }
    );
  }

  const durationMs = Date.now() - started;
  const text = await upstream.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!upstream.ok) {
    return NextResponse.json(
      {
        error: (data as { error?: string }).error ?? "MCP upstream error",
        status: upstream.status,
        data,
      },
      { status: upstream.status }
    );
  }

  return NextResponse.json({
    ...data,
    _meta: {
      durationMs,
      deskManagerId: String(deskManagerId),
    },
  });
}
