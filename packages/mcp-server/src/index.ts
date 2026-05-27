#!/usr/bin/env node
/**
 * Margin Call MCP Server (Phase 2 - MCP Desk Identity + Read Surface)
 *
 * Tools:
 *   get_desk, list_traders, list_deals, get_activity, get_outcomes,
 *   get_pending_approvals, sync_wallet, create_trader,
 *   configure_trader, fund_trader, resume_trader, pause_trader, withdraw_from_trader,
 *   register_withdraw_address, withdraw_to_address,
 *   create_deal, close_deal
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
    "Margin Call 1980s Wall Street desk manager for Claude. Read desk state; hire and manage traders (configure, fund, pause, resume, withdraw); sync wallet balances; cash out via register_withdraw_address + withdraw_to_address (ceremony gated). Autonomous cron picks deals for active funded traders.",
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

server.tool(
  "create_trader",
  "Hire a new trader for this MCP desk. Performs the SAME on-chain flow as the web app: ERC-8004 NFT mint plus CDP smart-account provisioning on Base Sepolia. Expect roughly 5–15 seconds wall-clock latency (multiple sponsored user ops). REQUIRED: stable idempotencyKey — reuse the exact same key when retrying timeouts so the API returns cached trader + tx hashes without re-submitting on-chain txs; generating a fresh key intentionally starts another hire attempt. Prerequisites: funded desk wallet and positive synced balance (get_desk, send USDC, sync_wallet). Returns traderId, tokenId, walletAddress, txHashes {mint,transfer}, summary.",
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
  "register_withdraw_address",
  "Submit a destination address for this desk's withdrawal allowlist (USDC cash-out target). FIRST registration per desk requires a one-time human-in-the-loop confirmation ceremony in the Margin Call web UI (the Privy user who issued the MCP key must log in and confirm the exact address to bind the human operator to the agent desk). After the ceremony succeeds, subsequent registrations append to the allowlist automatically. Always supply a stable idempotencyKey. Returns the normalized address and current allowlist on success, or a clear 'ceremony pending' error. Claude should surface the ceremony URL/guidance to the user when this fails with pending:true.",
  {
    address: z
      .string()
      .describe(
        "Destination 0x EVM address on Base (will be normalized to lowercase)"
      ),
    idempotencyKey: idempotencyKeySchema,
  },
  async ({ address, idempotencyKey }) =>
    callMcpApi("/api/mcp/desks/register-withdraw-address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, idempotencyKey }),
    })
);

server.tool(
  "withdraw_to_address",
  "Transfer USDC from this MCP desk's CDP wallet to a previously allowlisted address. Rejects non-allowlisted destinations and amounts that would exceed the desk's daily withdrawal cap. Requires ceremony to have been completed for the first address. Slow on-chain operation (~5-30s). Supply stable idempotencyKey. Returns txHash, amount, and updated daily used. Call get_desk + sync_wallet before/after to see balances. Claude must not attempt withdrawals until get_desk shows withdraw.ceremonyCompleted === true and at least one address in allowlist.",
  {
    address: z
      .string()
      .describe(
        "Allowlisted destination 0x address (must have been successfully registered and confirmed)"
      ),
    amountUsdc: z
      .number()
      .positive()
      .describe(
        "Amount in USDC (human units, e.g. 123.45). Must not exceed daily remaining cap."
      ),
    idempotencyKey: idempotencyKeySchema,
  },
  async ({ address, amountUsdc, idempotencyKey }) =>
    callMcpApi("/api/mcp/desks/withdraw-to-address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, amountUsdc, idempotencyKey }),
    })
);

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
  "Fund a trader escrow from the desk CDP wallet. Performs USDC approve (large allowance when needed — this step is rare after the first funding) + escrow depositFor + Convex balance sync. Expect ~2–8s wall time. REQUIRES: stable idempotencyKey (reuse on transient failure replays the cached error; generate a *fresh* key to re-attempt the funding intent). Prerequisites: positive synced desk balance, trader wallet ready. Returns txHash + concise summary. The large allowance makes retries after partial failures cheap (usually just the deposit tx).",
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
  "Withdraw USDC from trader escrow to the desk CDP wallet (escrow withdraw). Syncs escrow balance; call sync_wallet to refresh desk balance. Expect ~2–8s. Requires explicit positive amountUsdc and idempotencyKey.",
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
  "create_deal",
  "Create a NEW market deal as a trap for rival desks, signed and submitted by this MCP desk's CDP wallet. Performs: USDC.approve (rare after first call thanks to large allowance) + escrow.createDeal + Convex record. Expect ~3–10s wall time. The desk's traders are blocked from entering this deal (own-desk rule) — both in selection and at recordVerifiedEntry. Requires the market to be open (9:30–16:00 ET, weekdays); errors explicitly when closed. Prerequisites: synced desk wallet balance >= potUsdc. REQUIRED: stable idempotencyKey — reusing the same key within 24h returns the cached result without re-submitting on-chain txs; generate a *fresh* key to intentionally create another deal. Returns Convex deal id, on-chain deal id, tx hash, walletAddress, and summary.",
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
  "Close an MCP-desk-owned open deal via escrow.closeDeal from the desk CDP wallet, returning any remaining pot to the desk wallet. Refuses to close if the on-chain deal still has pending entries (the autonomous cycle is mid-resolution); wait for those to resolve and retry. Refuses to close deals not owned by this desk. Requires the market to be open. Slow on-chain operation (~3–10s). Supply stable idempotencyKey. Call sync_wallet after success to refresh the desk balance.",
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
    `[margin-call-mcp] MCP tools ready. API=${API_URL}  Tools: get_desk,list_traders,list_deals,get_activity,get_outcomes,get_pending_approvals,sync_wallet,create_trader,configure_trader,fund_trader,resume_trader,pause_trader,withdraw_from_trader,register_withdraw_address,withdraw_to_address,create_deal,close_deal  (key last4=${API_KEY.slice(-4)})`
  );
}

main().catch((err) => {
  console.error("[margin-call-mcp] fatal:", err);
  process.exit(1);
});
