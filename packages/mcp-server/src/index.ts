#!/usr/bin/env node
/**
 * Margin Call MCP Server
 *
 * Tools:
 *   get_desk, list_traders, list_deals, get_activity, get_outcomes,
 *   get_pending_approvals, answer_approval, sync_wallet, create_trader,
 *   configure_trader, fund_trader, resume_trader, pause_trader,
 *   withdraw_from_trader, create_deal, close_deal, set_desk_wallet,
 *   confirm_intent.
 *
 * Each MCP key maps 1:1 to a dedicated AGENT DESK. Treasury uses your Base
 * Account (BYO via Base MCP): prepare → send_calls → confirm_intent.
 * Authenticates via per-desk Bearer token (mc_live_...) read
 * from `MARGIN_CALL_MCP_KEY`. All responses are structured JSON.
 *
 * Install (recommended):
 *   claude mcp add margin-call -- npx -y @margin-call/mcp-server
 *
 * Local development:
 *   MARGIN_CALL_MCP_KEY=mc_live_xxx \
 *   MARGIN_CALL_API_URL=http://localhost:3000 \
 *   npx tsx packages/mcp-server/src/index.ts
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
  version: "0.2.0",
  description:
    "Margin Call 1980s Wall Street desk manager for Claude. Connect Base MCP for your desk wallet. Read desk state; set_desk_wallet; hire traders (server-side ERC-8004 mint); fund/create/close via prepare + Base MCP approval + confirm_intent. Autonomous cron picks deals for active funded traders. Per-action USDC caps, simulation, 24h idempotency, rate limits.",
});

const treasuryPrepareHint =
  "Returns phase=prepare with intentId, chain, calls[]. Execute via Base MCP send_calls, get user approval, then confirm_intent with intentId + txHash.";

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
    const { headers: initHeaders, ...restInit } = init ?? {};
    const res = await fetch(`${API_URL}${path}`, {
      method: "GET",
      ...restInit,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
        "User-Agent": "margin-call-mcp-server/0.1-phase1",
        ...(initHeaders ?? {}),
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
  "List your desk's traders with status (active/paused/wiped_out), ERC-8004 tokenId, escrow balance, mandate object, personality, walletStatus, CDP address, recent 30d P&L, latest activity snippet, profileImageUrl (signed Convex Storage URL or null until portrait is ready), and imageStatus. Use to decide who to fund, resume, pause, or configure. Optional: limit (default 20, max 50).",
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
  "Reads the live on-chain USDC balance (Base Sepolia) of this desk's bound Base Account and writes it into the desk record. Call after funding your Base Account and after treasury confirms. No parameters.",
  {},
  async () => callMcpApi("/api/mcp/desks/sync-wallet")
);

server.tool(
  "set_desk_wallet",
  "Bind your Base Account address to this MCP desk (from Base MCP 'show my wallets'). Required before fund_trader, create_deal, or create_trader. Body: walletAddress 0x...",
  {
    walletAddress: z
      .string()
      .describe("Your Base Account address on Base Sepolia (0x..., 42 chars)"),
  },
  async ({ walletAddress }) =>
    callMcpApi("/api/mcp/desks/set-wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress }),
    })
);

server.tool(
  "confirm_intent",
  "After executing a prepare response via Base MCP send_calls and receiving a tx hash, confirm the intent so margin-call records escrow/deal state. Body: intentId (from prepare), txHash (from get_request_status).",
  {
    intentId: z.string().min(1).describe("intentId from prepare response"),
    txHash: z
      .string()
      .min(1)
      .describe("Transaction hash after Base MCP approval completes"),
  },
  async ({ intentId, txHash }) =>
    callMcpApi("/api/mcp/intents/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intentId, txHash }),
    })
);

server.tool(
  "create_trader",
  "Hire a new trader (one-shot server call, no Base MCP approval). ERC-8004 NFT mint + trader identity wallet on Base Sepolia (gas sponsored). Prerequisites: set_desk_wallet, fund Base Account, sync_wallet, positive balance. REQUIRED: stable idempotencyKey for retries. Returns traderId, tokenId, walletAddress, txHashes, summary.",
  {
    name: z
      .string()
      .min(1)
      .describe(
        "Trader handle (same rules as web: letters, digits, underscore, max 15 chars after trim)"
      ),
    mandate: z
      .any()
      .optional()
      .describe("Optional mandate object (strategy knobs) — JSON-serializable"),
    personality: z
      .string()
      .optional()
      .describe("Optional trader personality text"),
    idempotencyKey: z
      .string()
      .min(8)
      .describe(
        "Stable key for this hire intent (e.g. UUID). Mandatory on retries: same key within 24h replays cached result without new transactions."
      ),
  },
  async ({ name, mandate, personality, idempotencyKey }) =>
    callMcpApi("/api/mcp/traders/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mandate, personality, idempotencyKey }),
    })
);

const idempotencyKeySchema = z
  .string()
  .min(8)
  .describe(
    "Stable key for this intent (e.g. UUID). Reuse the same key on retries within 24h to replay cached results without re-submitting on-chain txs."
  );

const traderIdSchema = z
  .string()
  .min(1)
  .describe("Convex trader document id from list_traders or create_trader");

server.tool(
  "configure_trader",
  "Update mandate and personality for a trader owned by this MCP desk. Requires idempotencyKey. Does not change trader status or on-chain state.",
  {
    traderId: traderIdSchema,
    mandate: z
      .any()
      .describe(
        "Mandate object (strategy knobs): bankroll_pct, keywords, etc."
      ),
    personality: z
      .string()
      .nullable()
      .optional()
      .describe("Trader personality text, or null to clear"),
    idempotencyKey: idempotencyKeySchema,
  },
  async ({ traderId, mandate, personality, idempotencyKey }) =>
    callMcpApi(`/api/mcp/traders/${traderId}/configure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traderId, mandate, personality, idempotencyKey }),
    })
);

server.tool(
  "fund_trader",
  `Prepare funding a trader escrow from your Base Account (approve + depositFor batched when needed). ${treasuryPrepareHint} Prerequisites: set_desk_wallet, sync_wallet, positive balance, trader ready. idempotencyKey required.`,
  {
    traderId: traderIdSchema,
    amountUsdc: z
      .number()
      .positive()
      .describe("USDC amount in human units (e.g. 50 for $50)"),
    idempotencyKey: idempotencyKeySchema,
  },
  async ({ traderId, amountUsdc, idempotencyKey }) =>
    callMcpApi(`/api/mcp/traders/${traderId}/fund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traderId, amountUsdc, idempotencyKey }),
    })
);

server.tool(
  "resume_trader",
  "Activate an owned trader for the autonomous deal cycle. Same gates as the web app: wallet ready, escrow balance > 0, not wiped out, market open. Requires idempotencyKey.",
  {
    traderId: traderIdSchema,
    idempotencyKey: idempotencyKeySchema,
  },
  async ({ traderId, idempotencyKey }) =>
    callMcpApi(`/api/mcp/traders/${traderId}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traderId, idempotencyKey }),
    })
);

server.tool(
  "pause_trader",
  "Pause an owned trader (stops autonomous deal entry). Requires idempotencyKey.",
  {
    traderId: traderIdSchema,
    idempotencyKey: idempotencyKeySchema,
  },
  async ({ traderId, idempotencyKey }) =>
    callMcpApi(`/api/mcp/traders/${traderId}/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traderId, idempotencyKey }),
    })
);

server.tool(
  "withdraw_from_trader",
  `Prepare withdrawing USDC from trader escrow to your Base Account. ${treasuryPrepareHint} Then sync_wallet.`,
  {
    traderId: traderIdSchema,
    amountUsdc: z
      .number()
      .positive()
      .describe("USDC to withdraw in human units"),
    idempotencyKey: idempotencyKeySchema,
  },
  async ({ traderId, amountUsdc, idempotencyKey }) =>
    callMcpApi(`/api/mcp/traders/${traderId}/withdraw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traderId, amountUsdc, idempotencyKey }),
    })
);

server.tool(
  "answer_approval",
  "Approve or reject a pending high-stakes deal approval for one of your traders. Use after get_desk shows pendingApprovals.count > 0 (call get_pending_approvals to inspect prompt + remaining TTL). Ownership is enforced server-side. `approve` schedules an immediate trader cycle so the deal is entered without waiting for the next scheduler tick. `reject` lets the trader pick a different deal. Approvals not answered before their TTL are auto-rejected server-side; calling answer_approval on an already-resolved row returns the current status without mutating state. Requires stable idempotencyKey — same key within 24h replays the cached result. Response.summary includes trader name, deal prompt snippet, escrow balance, and the remaining pendingApprovals count so portfolio change is visible without another get_desk call.",
  {
    approvalId: z
      .string()
      .min(1)
      .describe(
        "Convex dealApprovals document id from get_pending_approvals.approvals[].approvalId"
      ),
    decision: z
      .enum(["approve", "reject"])
      .describe(
        '"approve" to authorize the high-stakes deal entry; "reject" to skip it and free the trader to pick another deal'
      ),
    reason: z
      .string()
      .optional()
      .describe("Optional free-text reason recorded in the audit log"),
    idempotencyKey: idempotencyKeySchema,
  },
  async ({ approvalId, decision, reason, idempotencyKey }) =>
    callMcpApi("/api/mcp/approvals/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        approvalId,
        decision,
        reason,
        idempotencyKey,
      }),
    })
);

server.tool(
  "create_deal",
  `Prepare creating a market deal (trap for rivals) from your Base Account. ${treasuryPrepareHint} Own-desk traders cannot enter. Market must be open. Balance >= potUsdc. confirm returns dealId + onChainDealId.`,
  {
    prompt: z
      .string()
      .min(1)
      .describe(
        "Deal prompt (the headline/scenario the LLM uses to resolve outcomes)"
      ),
    potUsdc: z
      .number()
      .positive()
      .describe(
        "Total USDC pot funded from the desk wallet (human units, e.g. 100 for $100)"
      ),
    entryCostUsdc: z
      .number()
      .positive()
      .describe(
        "Cost per trader entry in USDC (human units). Must be <= potUsdc."
      ),
    idempotencyKey: idempotencyKeySchema,
  },
  async ({ prompt, potUsdc, entryCostUsdc, idempotencyKey }) =>
    callMcpApi("/api/mcp/deals/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, potUsdc, entryCostUsdc, idempotencyKey }),
    })
);

server.tool(
  "close_deal",
  `Prepare closing an owned open deal (pot returns to your Base Account). ${treasuryPrepareHint} Fails if pending on-chain entries remain. Market open. sync_wallet after confirm.`,
  {
    dealId: z
      .string()
      .min(1)
      .describe("Convex deal id (from list_deals or create_deal)"),
    idempotencyKey: idempotencyKeySchema,
  },
  async ({ dealId, idempotencyKey }) =>
    callMcpApi("/api/mcp/deals/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId, idempotencyKey }),
    })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr only (stdio transport uses stdout for protocol)
  console.error(
    `[margin-call-mcp] MCP tools ready. API=${API_URL}  Tools: get_desk,set_desk_wallet,sync_wallet,confirm_intent,list_traders,list_deals,get_activity,get_outcomes,get_pending_approvals,answer_approval,create_trader,configure_trader,fund_trader,resume_trader,pause_trader,withdraw_from_trader,create_deal,close_deal  (key last4=${API_KEY.slice(-4)})`
  );
}

main().catch((err) => {
  console.error("[margin-call-mcp] fatal:", err);
  process.exit(1);
});
