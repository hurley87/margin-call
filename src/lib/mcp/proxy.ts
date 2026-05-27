import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createConvexAdminClient } from "@/lib/convex/server-client";
import { hashMcpKey, MCP_KEY_PREFIX } from "./keys";
import { internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const API_KEY_SECRET = process.env.MCP_API_KEY_SECRET;
const SERVICE_TOKEN = process.env.MCP_SERVICE_TOKEN;
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

const BEARER_RE = new RegExp(`^Bearer (${MCP_KEY_PREFIX}[A-Za-z0-9_-]+)$`);

export async function validateMcpKey(
  request: NextRequest
): Promise<{ deskManagerId: Id<"deskManagers"> } | NextResponse> {
  if (!API_KEY_SECRET) {
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
    .catch(() => {});

  return { deskManagerId };
}

export interface ProxyMcpReadOptions {
  /** The Convex HTTP action path under /mcp, e.g. "traders/list" */
  convexAction: string;
}

/**
 * Shared handler for all MCP read-only Next.js routes.
 * Validates the mc_live_* Bearer key, touches lastUsed (debounced), then
 * proxies the request (with whitelisted URL params) as JSON body to the
 * corresponding Convex /mcp/* httpAction (authenticated by SERVICE_TOKEN).
 *
 * Returns the upstream payload + _meta (duration, deskManagerId).
 */
export async function proxyMcpRead(
  request: NextRequest,
  { convexAction }: ProxyMcpReadOptions
) {
  if (!SERVICE_TOKEN || !CONVEX_URL) {
    return NextResponse.json(
      { error: "MCP is not configured on this server" },
      { status: 500 }
    );
  }

  const authResult = await validateMcpKey(request);
  if (authResult instanceof NextResponse) return authResult;
  const { deskManagerId } = authResult;

  const search = request.nextUrl.searchParams;
  const body: Record<string, unknown> = {
    deskManagerId: String(deskManagerId),
  };
  const limit = search.get("limit");
  if (limit) body.limit = Number(limit);
  const traderId = search.get("traderId");
  if (traderId) body.traderId = traderId;
  const includeClosed = search.get("includeClosed");
  if (includeClosed) body.includeClosed = includeClosed === "true";

  // Convex HTTP actions are served on .convex.site, not .convex.cloud.
  const httpActionBase = CONVEX_URL.replace(/\/$/, "").replace(
    /\.convex\.cloud$/,
    ".convex.site"
  );
  const mcpActionUrl = `${httpActionBase}/mcp/${convexAction}`;

  let upstream: Response;
  const started = Date.now();
  try {
    upstream = await fetch(mcpActionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_TOKEN}`,
      },
      body: JSON.stringify(body),
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
