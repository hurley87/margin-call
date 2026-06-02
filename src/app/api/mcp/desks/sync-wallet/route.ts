import { NextRequest, NextResponse } from "next/server";
import { createConvexAdminClient } from "@/lib/convex/server-client";
import { validateMcpKey } from "@/lib/mcp/proxy";
import { internal } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

const SERVICE_TOKEN = process.env.MCP_SERVICE_TOKEN;
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

/**
 * GET /api/mcp/desks/sync-wallet
 * Validates MCP key, ensures desk wallet is bound, then proxies to Convex
 * `syncWalletFromChainForMcp` which reads USDC balanceOf on-chain authoritatively.
 */
export async function GET(request: NextRequest) {
  const authResult = await validateMcpKey(request);
  if (authResult instanceof NextResponse) return authResult;

  const { deskManagerId } = authResult;

  if (!SERVICE_TOKEN || !CONVEX_URL) {
    return NextResponse.json(
      { error: "MCP is not configured on this server" },
      { status: 500 }
    );
  }

  const convex = createConvexAdminClient();

  const dm = (await convex.query(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    internal.deskManagers.getByIdInternal as any,
    { id: deskManagerId }
  )) as {
    _id: Id<"deskManagers">;
    subject: string;
    walletAddress?: string;
  } | null;

  if (!dm?.walletAddress) {
    return NextResponse.json(
      {
        error:
          "Desk wallet address not yet provisioned for this MCP credential",
      },
      { status: 400 }
    );
  }

  const httpActionBase = CONVEX_URL.replace(/\/$/, "").replace(
    /\.convex\.cloud$/,
    ".convex.site"
  );
  const mcpActionUrl = `${httpActionBase}/mcp/desks/sync-wallet`;

  const started = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(mcpActionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        deskManagerId: String(deskManagerId),
      }),
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
