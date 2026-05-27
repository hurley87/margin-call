#!/usr/bin/env node
/**
 * Margin Call MCP Server (Phase 2 - MCP Desk Identity + Read Surface)
 *
 * Tools:
 *   get_desk, list_traders, list_deals, get_activity, get_outcomes,
 *   get_pending_approvals, sync_wallet
 *
 * Each MCP key maps 1:1 to a dedicated desk with subject `mcp:cdp-wallet:<id>`
 * and its own CDP server wallet (provisioned at key issuance).
 *
 * Authenticates via per-desk Bearer token (mc_live_...) from env.
 * All responses are structured JSON (pretty-printed for terminal).
 *
 * Usage (local dev / contributors):
 *   MARGIN_CALL_MCP_KEY=mc_live_xxx \
 *   MARGIN_CALL_API_URL=http://localhost:3000 \
 *   npx tsx /path/to/packages/mcp-server/src/index.ts
 *
 * In Claude Code / Cursor MCP settings (local path):
 *   command: npx
 *   args: ["-y", "tsx", "/absolute/path/to/margin-call/packages/mcp-server/src/index.ts"]
 *   env: { MARGIN_CALL_MCP_KEY, MARGIN_CALL_API_URL }
 *
 * Later (Phase 6): `claude mcp add margin-call -- npx -y @margin-call/mcp-server`
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL =
  process.env.MARGIN_CALL_API_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";
const API_KEY =
  process.env.MARGIN_CALL_MCP_KEY || process.env.MCP_API_KEY || "";

if (!API_KEY) {
  console.error(
    "FATAL: MARGIN_CALL_MCP_KEY (or MCP_API_KEY) environment variable is required.\n" +
      "Obtain one by calling POST /api/mcp/keys while authenticated via the web UI (Privy)."
  );
  process.exit(1);
}

const server = new McpServer({
  name: "margin-call",
  version: "0.1.0-phase1",
  description:
    "Margin Call 1980s Wall Street desk manager for Claude. Phase 1 read-only surface: get_desk, list_traders, list_deals, get_activity, get_outcomes, get_pending_approvals. Inspect full game state from the terminal without browser auth.",
});

function buildQueryString(
  params: Record<string, string | number | boolean | undefined>
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function callMcpApi(path: string, init?: RequestInit) {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
        "User-Agent": "margin-call-mcp-server/0.1-phase1",
        ...(init?.headers ?? {}),
      },
      ...(init ?? {}),
    });

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Margin Call MCP API error (${res.status}): ${JSON.stringify(json, null, 2)}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(json, null, 2),
        },
      ],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to reach Margin Call MCP API at ${API_URL}: ${msg}`,
        },
      ],
      isError: true,
    };
  }
}

server.tool(
  "get_desk",
  "Fetch the current state of the desk that owns the configured MCP API key. Returns wallet address + on-chain USDC balance (Base Sepolia), number of owned traders, number of open deals you created, recent P&L across your traders, pending high-stakes approvals count + age, and a concise summary string (with funding instruction when balance is zero). Call this FIRST on every session or before any write decision.",
  {},
  async () => callMcpApi("/api/mcp/desks")
);

server.tool(
  "list_traders",
  "List your desk's traders with status (active/paused/wiped_out), ERC-8004 tokenId, escrow balance, mandate object, personality, walletStatus, CDP address, recent 30d P&L, and latest activity snippet. Use to decide who to fund, resume, pause, or configure. Optional: limit (default 20, max 50).",
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Maximum traders to return (default 20)"),
  },
  async ({ limit }) =>
    callMcpApi(`/api/mcp/traders${buildQueryString({ limit })}`)
);

server.tool(
  "list_deals",
  "List open market deals (and optionally closed). Each entry includes prompt, source headline, pot, entry cost, status, creator type, entry count, and crucially `eligibleForMe` (false for deals created by your own desk — your traders are blocked from entering those). Use before any funding or strategy decisions. Optional: limit, includeClosed.",
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Max deals (default 30)"),
    includeClosed: z
      .boolean()
      .optional()
      .describe("Include non-open deals (rarely useful, default false)"),
  },
  async ({ limit, includeClosed }) =>
    callMcpApi(
      `/api/mcp/deals${buildQueryString({ limit, includeClosed: includeClosed ? true : undefined })}`
    )
);

server.tool(
  "get_activity",
  "Recent chronological activity for the desk (or a single trader). Returns both structured rows and a `lines[]` array of terminal-friendly strings already formatted for easy reading. Use to understand what your traders have been doing. Optional: traderId (scope to one), limit (default 30).",
  {
    traderId: z
      .string()
      .optional()
      .describe("Specific trader ID to scope activity (otherwise desk-wide)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Max entries (default 30)"),
  },
  async ({ traderId, limit }) =>
    callMcpApi(`/api/mcp/activity${buildQueryString({ traderId, limit })}`)
);

server.tool(
  "get_outcomes",
  "Recent resolved deal outcomes for your traders (P&L, wipeouts, assets gained/lost, on-chain tx hashes). Critical for reviewing performance and reconstructing history. Optional: traderId, limit (default 20).",
  {
    traderId: z
      .string()
      .optional()
      .describe("Specific trader ID to scope outcomes"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Max outcomes (default 20)"),
  },
  async ({ traderId, limit }) =>
    callMcpApi(`/api/mcp/outcomes${buildQueryString({ traderId, limit })}`)
);

server.tool(
  "get_pending_approvals",
  "High-stakes deal approvals awaiting your decision, with remaining TTL in seconds. Includes trader, deal prompt, pot/entry cost, and expiry. Use when get_desk shows pendingApprovals.count > 0. Approvals auto-expire server-side; you must answer in time or the trader's cycle will be blocked. Optional: limit.",
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Max pending approvals (default 20)"),
  },
  async ({ limit }) =>
    callMcpApi(`/api/mcp/approvals${buildQueryString({ limit })}`)
);

server.tool(
  "sync_wallet",
  "Reads the live on-chain USDC balance (Base Sepolia) of this MCP desk's CDP server wallet and writes it into the desk record. This makes get_desk, funding gates, and the web UI see the correct balance after you (or anyone) send USDC to the wallet address. Call it shortly after funding. No parameters. Pure read (logged compactly).",
  {},
  async () => callMcpApi("/api/mcp/desks/sync-wallet")
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr only (stdio transport uses stdout for protocol)
  console.error(
    `[margin-call-mcp] Phase 2 ready. API=${API_URL}  Tools: get_desk,list_traders,list_deals,get_activity,get_outcomes,get_pending_approvals,sync_wallet  (key last4=${API_KEY.slice(-4)})`
  );
}

main().catch((err) => {
  console.error("[margin-call-mcp] fatal:", err);
  process.exit(1);
});
