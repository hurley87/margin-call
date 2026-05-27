import { NextRequest, NextResponse } from "next/server";
import { createConvexAdminClient } from "@/lib/convex/server-client";
import { makePublicClient } from "@/lib/contracts/client";
import { USDC_SEPOLIA_ADDRESS } from "@/lib/contracts/escrow";
import { usdcFromRaw } from "@/lib/contracts/balance";
import { erc20Abi } from "viem";
import { validateMcpKey } from "@/lib/mcp/proxy";
import { internal } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

const SERVICE_TOKEN = process.env.MCP_SERVICE_TOKEN;
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

/**
 * GET /api/mcp/desks/sync-wallet
 * Uses shared validateMcpKey (thin wrapper around it), performs the on-chain
 * USDC read here (viem constraint: httpActions cannot run under "use node"),
 * then proxies the read result to the dedicated Convex POST /mcp/desks/sync-wallet
 * httpAction. The Convex action does the internal syncWalletBalance call +
 * mcpRequests audit log (SERVICE_TOKEN), following the exact pattern of the
 * other 6 MCP tools. Success/error envelope + caller behavior (MCP server etc.)
 * preserved 100%. The read is the only piece that could not move to Convex.
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

  // Fetch the desk (to check wallet + for subject in the mut path, same as before)
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

  const walletAddress = dm.walletAddress;

  // Read live on-chain balance (public RPC, same helpers as browser/Privy paths).
  // Must stay in Next.js route: Convex httpActions do not support the Node
  // runtime required for reliable viem usage alongside httpAction.
  const publicClient = makePublicClient();
  const raw = await publicClient.readContract({
    address: USDC_SEPOLIA_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [walletAddress as `0x${string}`],
  });
  const balanceUsdc = usdcFromRaw(raw);

  // Proxy the result of the read to Convex httpAction (does mut + log only).
  // Same .convex.site rewrite + fetch pattern as proxyMcpRead.
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
        walletAddress,
        balanceUsdc,
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
