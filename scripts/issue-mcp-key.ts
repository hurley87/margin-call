#!/usr/bin/env tsx
/**
 * scripts/issue-mcp-key.ts
 *
 * One-shot helper to issue a fresh per-desk MCP API key (mc_live_...) for the
 * Margin Call MCP server (Phase 2+).
 *
 * This calls your running local Next.js dev server and requires a real
 * Privy-issued JWT from an active browser session.
 *
 * ## How to get a valid PRIVY_JWT
 *
 * 1. Open http://localhost:3000 (or your dev URL) and log in with Privy.
 * 2. Open DevTools → Network tab.
 * 3. Perform any authenticated action (refresh dashboard, open a dialog, etc.).
 * 4. Click any request to your /api/* or Convex endpoints.
 * 5. In Headers, find `Authorization: Bearer <very_long_jwt>`.
 * 6. Copy everything AFTER "Bearer " (the JWT itself).
 *
 * ## Usage
 *
 *   PRIVY_JWT="eyJhbGci..." npx tsx scripts/issue-mcp-key.ts
 *
 * Or pass via flag:
 *
 *   npx tsx scripts/issue-mcp-key.ts --token "eyJhbGci..."
 *
 * Optional:
 *   MARGIN_CALL_API_URL=http://localhost:3001 npx tsx ...
 *
 * The script prints the raw key exactly once (save it immediately).
 */

const API_URL =
  process.env.MARGIN_CALL_API_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

function getToken(): string | undefined {
  // --token foo
  const args = process.argv.slice(2);
  const tokenIdx = args.indexOf("--token");
  if (tokenIdx !== -1 && args[tokenIdx + 1]) {
    return args[tokenIdx + 1];
  }
  // env var
  return (
    process.env.PRIVY_JWT ||
    process.env.PRIVY_TOKEN ||
    process.env.PRIVY_ACCESS_TOKEN
  );
}

async function main() {
  const token = getToken();

  if (!token) {
    console.error(`
❌  No Privy JWT provided.

How to obtain one (takes 20 seconds):

  1. Make sure your dev server is running: pnpm dev
  2. Open http://localhost:3000 in a browser and fully log in with Privy (email OTP or wallet).
  3. Open DevTools (F12) → "Network" tab.
  4. Click the "Fetch/XHR" filter.
  5. Do something authenticated (e.g. refresh the page or click "Fund Desk").
  6. Click one of the requests (look for paths containing /api/ or convex).
  7. In the right pane, Headers → find:
        Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
  8. Copy the long string AFTER "Bearer ".

Then run one of:

  PRIVY_JWT="paste_the_long_string_here" npx tsx scripts/issue-mcp-key.ts

  # or

  npx tsx scripts/issue-mcp-key.ts --token "paste_the_long_string_here"

If your dev server is on a different port:

  MARGIN_CALL_API_URL=http://localhost:3001 PRIVY_JWT=... npx tsx ...
`);
    process.exit(1);
  }

  console.log(`→ Issuing MCP key against ${API_URL}/api/mcp/keys ...`);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/mcp/keys`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌  Failed to reach ${API_URL}`);
    console.error(`   ${msg}`);
    console.error("\n   Is `pnpm dev` running?");
    process.exit(1);
  }

  const text = await res.text();
  let data: {
    key?: string;
    deskId?: string;
    subject?: string;
    walletAddress?: string;
    raw?: string;
  };
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    console.error(`\n❌  Key issuance failed (${res.status})`);
    console.error(data);
    process.exit(1);
  }

  if (!data.key) {
    console.log("\n✅  Request succeeded but no key in response:");
    console.dir(data, { depth: 3 });
    return;
  }

  console.log("\n✅  MCP key issued successfully!\n");
  console.log("Raw key (SAVE THIS — it is only shown once):\n");
  console.log(data.key);
  console.log("");

  if (data.deskId) console.log(`Desk ID:        ${data.deskId}`);
  if (data.subject) console.log(`Subject:        ${data.subject}`);
  if (data.walletAddress) console.log(`Wallet address: ${data.walletAddress}`);

  console.log("\n────────────────────────────────────────────────────────");
  console.log("To start the MCP server locally with this key:\n");
  console.log(`  MARGIN_CALL_MCP_KEY=${data.key} \\`);
  console.log(`  MARGIN_CALL_API_URL=${API_URL} \\`);
  console.log(`  npx tsx packages/mcp-server/src/index.ts\n`);

  console.log("Add to Cursor / Claude Code (example .mcp.json):\n");
  console.log(
    JSON.stringify(
      {
        mcpServers: {
          "margin-call": {
            command: "npx",
            args: [
              "-y",
              "tsx",
              "/absolute/path/to/your/margin-call/packages/mcp-server/src/index.ts",
            ],
            env: {
              MARGIN_CALL_MCP_KEY: data.key,
              MARGIN_CALL_API_URL: API_URL,
            },
          },
        },
      },
      null,
      2
    )
  );

  console.log("\nAfter adding/restarting the agent you should see the tools:");
  console.log(
    "  get_desk, list_traders, list_deals, get_activity, get_outcomes,"
  );
  console.log("  get_pending_approvals, sync_wallet\n");
}

main().catch((err) => {
  console.error("\n❌  Unexpected error while issuing key:");
  console.error(err);
  process.exit(1);
});
