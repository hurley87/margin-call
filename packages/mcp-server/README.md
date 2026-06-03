# @margin-call/mcp-server

MCP server that lets Claude Code (and any MCP-compatible agent) run an
autonomous **AGENT DESK** in the Margin Call 1980s Wall Street trading game
from the terminal. Each `mc_live_*` API key maps 1:1 to a dedicated desk
with a **bring-your-own Base Account** (via [Base MCP](https://mcp.base.org)).
Claude can hire traders, fund escrow, create trap deals, answer approvals,
and sync balances — treasury writes use prepare → Base MCP approval → confirm.

The autonomous deal-entry cycle continues to run server-side and picks
per-deal entries on behalf of MCP-owned traders.

## Two ways to connect

| Path                                                  | Best for                                                               | Requires                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Base MCP plugin** (recommended on harness surfaces) | Claude Code, Cursor, Codex — agents with a direct HTTP tool + Base MCP | [Base MCP](https://mcp.base.org) + `base-mcp` skill + plugin spec |
| **Standalone stdio MCP**                              | Chat-only surfaces, or when you prefer named MCP tools                 | `@margin-call/mcp-server` npm package                             |

Both paths hit the same `/api/mcp/*` backend and use the same prepare → Base MCP `send_calls` → `confirm_intent` treasury flow.

### Base MCP plugin (harness surfaces)

The plugin is a markdown spec ([`base-plugin/margin-call.md`](base-plugin/margin-call.md)) that teaches the agent to call the Margin Call HTTP API directly and execute treasury calldata through Base MCP. No separate MCP server process.

1. Install Base MCP and the `base-mcp` skill (`npx skills add base/skills --skill base-mcp`).
2. Copy the plugin spec into your skill's `plugins/` directory, or fetch it from a deployed Margin Call API:

   ```sh
   curl -s https://your-deployment.example.com/api/mcp/plugin \
     -o ~/.claude/skills/base-mcp/plugins/margin-call.md
   ```

3. Set `MARGIN_CALL_MCP_KEY` (and optionally `MARGIN_CALL_API_URL`) in your harness environment.
4. Prompt the agent to run your desk — it loads the plugin on demand.

The Margin Call API host is **not** on Base MCP's `web_request` allowlist; the harness must have a real HTTP tool for authed GET/POST. On Claude.ai / ChatGPT consumer apps, use the standalone stdio MCP below instead.

See [Base custom plugins docs](https://docs.base.org/ai-agents/plugins/custom-plugins).

## Install (standalone stdio MCP)

```sh
claude mcp add margin-call -- npx -y @margin-call/mcp-server
```

You will be prompted for your per-desk MCP API key (stored in Claude's
secret vault). To get a key, sign in to the Margin Call web app and use
the MCP operator dialog or `POST /api/mcp/keys` (see "Issue a key" below).

Required environment variable (passed via the `claude mcp add` prompts or
set in your MCP client config):

| Variable              | Description                                                              |
| --------------------- | ------------------------------------------------------------------------ |
| `MARGIN_CALL_MCP_KEY` | Per-desk Bearer token (`mc_live_...`). One key = one AGENT DESK.         |
| `MARGIN_CALL_API_URL` | Optional. Margin Call API base URL. Defaults to `http://localhost:3000`. |

## Tools

All writes require a stable `idempotencyKey` — retrying with the same key
within 24 h returns the cached result (and the cached error on failure)
without re-submitting the underlying transaction.

### Reads

- `get_desk` — wallet address, USDC balance, trader/open-deal counts,
  recent P&L, pending approvals, withdraw status, terminal-friendly summary.
- `list_traders` — owned traders with status, tokenId, escrow balance,
  mandate, personality, wallet status, recent P&L.
- `list_deals` — open market deals with `eligibleForMe` (own-desk blocked).
- `get_activity` — chronological recent activity (desk- or trader-scoped).
- `get_outcomes` — resolved deal outcomes, P&L, wipeouts, tx hashes.
- `get_pending_approvals` — high-stakes approvals awaiting decision + TTL.
- `sync_wallet` — refresh on-chain USDC balance for the bound Base Account.
- `set_desk_wallet` — bind your Base Account address (required once per desk).

### Writes

- `create_trader` — one-shot ERC-8004 mint + trader wallet (server-side; requires `idempotencyKey`).
- `configure_trader`, `resume_trader`, `pause_trader`, `answer_approval` — Convex-only (`idempotencyKey`).
- **Treasury (prepare + confirm):** `fund_trader`, `withdraw_from_trader`, `create_deal`, `close_deal` return `{ phase: "prepare", intentId, chain, calls[] }`. Execute via Base MCP `send_calls`, then `confirm_intent` with `{ intentId, txHash }`.

## Production safety rails

Every write is gated server-side by:

- **Per-action USDC caps** — single-tx ceiling (default 500 USDC,
  per-desk configurable via `perActionCapUsdc` + per-tool override map).
- **Intent TTL** — prepared calls expire after 1 hour if not confirmed.
- **Transaction simulation** — viem `simulateContract` runs before every
  on-chain user-op; revert reasons are surfaced verbatim.
- **24 h idempotency replay** — same `idempotencyKey` returns the same
  cached result; the server never re-submits the underlying tx.
- **Rate limits** — 60 req/min/IP pre-auth, 30 req/min/desk post-auth.
- **Market hours** — `create_deal`, `close_deal`, and `resume_trader`
  enforce Mon–Fri 09:30–16:00 ET.
- **Own-desk blocking** — MCP-owned traders cannot enter deals created
  by the same desk (enforced in selection and at `recordVerifiedEntry`).
- **API key rotation + revocation** — rotate or revoke from the web
  operator dialog; the old key is rejected on the next request.
- **Full audit log** — every read + write logged to `mcpRequests` with
  duration, result, error, and tx hash where applicable.

## Issue a key (Base MCP — no Privy)

With Base MCP connected:

1. `POST /api/mcp/keys/challenge` `{ "address": "0x..." }` — SIWE message
2. Base MCP `sign` (personal_sign) — user approves in Base Account
3. `POST /api/mcp/keys` `{ "message", "signature" }` — returns `mc_live_*` (once)

The signing Base Account is auto-bound as desk treasury. Re-signing revokes the prior key (latest-wins recovery). See `base-plugin/margin-call.md` for the full onboarding flow.

## Local development (running the server from source)

```sh
MARGIN_CALL_MCP_KEY=mc_live_... \
MARGIN_CALL_API_URL=http://localhost:3000 \
pnpm --filter @margin-call/mcp-server dev
```

Or wire the local path into your MCP client (`.mcp.json`):

```json
{
  "mcpServers": {
    "margin-call": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "/absolute/path/to/margin-call/packages/mcp-server/src/index.ts"
      ],
      "env": {
        "MARGIN_CALL_MCP_KEY": "mc_live_...",
        "MARGIN_CALL_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

## Manual smoke test (Base Sepolia)

The end-to-end smoke script exercises the full tool surface against a
deployed Margin Call API and the Base Sepolia escrow. Not run in CI —
invoke manually before publishing or after major changes:

```sh
MARGIN_CALL_MCP_KEY=mc_live_... \
MARGIN_CALL_API_URL=https://your-deployment.example.com \
pnpm tsx tests/e2e/mcp-sepolia.ts
```

The script issues a sequence of `get_desk`, `sync_wallet`, `create_trader`,
(retry with the same key → asserts `cached: true`), `fund_trader`,
`withdraw_from_trader`, `register_withdraw_address` (with an operator
pause for the browser ceremony), `withdraw_to_address`, `create_deal`,
`close_deal`. Each step prints `{ tool, durationMs, txHash }` and hard
fails on any non-2xx.

## Publishing (operator workflow)

```sh
cd packages/mcp-server
pnpm build                    # → dist/index.{js,d.ts}; runs via prepublishOnly too
npm pack --dry-run            # sanity-check tarball contents
npm publish --access public   # publishes @margin-call/mcp-server to npm
```

Bump `version` in `package.json` first (npm versions are immutable).

## Security notes

- One key = one desk = one CDP server wallet. Lose the key and you lose
  control of the desk; rotate via the operator dialog if compromised.
- No arbitrary transactions, no raw DB access — every tool maps to a
  specific game verb, server-validated before any on-chain submission.
- All raw keys exist only in transit; only HMAC hashes are persisted.
- The autonomous deal-entry cycle owns per-deal entry decisions; Claude
  cannot enter deals directly.

See `plans/mcp.md` in the repo root for the full design history.
