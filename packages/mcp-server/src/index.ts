#!/usr/bin/env node
/**
 * Margin Call MCP Server (Phase 1)
 *
 * Exposes a single tool: get_desk
 * - Authenticates to the Margin Call backend using a per-desk Bearer token
 *   (mc_live_...) passed via env var.
 * - Returns wallet address, USDC balance, trader count, own open-deal count,
 *   recent P&L, and a helpful summary (including "send USDC here" when unfunded).
 *
 * Usage (local dev / contributors):
 *   MARGIN_CALL_MCP_KEY=mc_live_xxx \
 *   MARGIN_CALL_API_URL=http://localhost:3000 \
 *   npx tsx /path/to/packages/mcp-server/src/index.ts
 *
 * In Claude Code MCP settings (local path example):
 *   command: npx
 *   args: ["-y", "tsx", "/absolute/path/to/margin-call/packages/mcp-server/src/index.ts"]
 *   env:
 *     MARGIN_CALL_MCP_KEY: "mc_live_..."
 *     MARGIN_CALL_API_URL: "http://localhost:3000"
 *
 * When published (Phase 6): `claude mcp add margin-call -- npx -y @margin-call/mcp-server`
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

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
    "Margin Call 1980s Wall Street desk manager for Claude. Phase 1 exposes read-only get_desk so you can see your wallet balance, traders, deals, and P&L from the terminal.",
});

server.tool(
  "get_desk",
  "Fetch the current state of the desk that owns the configured MCP API key. Returns wallet address + on-chain USDC balance (Base Sepolia), number of owned traders, number of open deals you created, recent P&L across your traders, and a concise summary string. When balance is zero the summary contains a funding instruction with the exact deposit address. Call this first on every session or when you need a snapshot before deciding on trader or deal actions.",
  // No input parameters for the minimal scaffold
  {},
  async () => {
    try {
      const res = await fetch(`${API_URL}/api/mcp/desks`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json",
          "User-Agent": "margin-call-mcp-server/0.1-phase1",
        },
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
              type: "text",
              text: `Margin Call MCP API error (${res.status}): ${JSON.stringify(json, null, 2)}`,
            },
          ],
          isError: true,
        };
      }

      // Return pretty-printed JSON so Claude can read it directly in the terminal.
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(json, null, 2),
          },
        ],
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text",
            text: `Failed to reach Margin Call MCP API at ${API_URL}: ${msg}`,
          },
        ],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr only (stdio transport uses stdout for protocol)
  console.error(
    `[margin-call-mcp] Phase 1 server ready. API=${API_URL}  Tool: get_desk  (key last4=${API_KEY.slice(-4)})`
  );
}

main().catch((err) => {
  console.error("[margin-call-mcp] fatal:", err);
  process.exit(1);
});
