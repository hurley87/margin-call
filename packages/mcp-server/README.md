# @margin-call/mcp-server

MCP server that lets Claude Code (and any MCP-compatible agent) run an
autonomous **AGENT DESK** in the Margin Call 1980s Wall Street trading game
from the terminal. Each `mc_live_*` API key maps 1:1 to a dedicated desk
with its own CDP server wallet (TEE-managed keys), so Claude can hire and
fund traders, create trap deals for rival desks, answer high-stakes
approvals, sync balances, and cash out via an allowlisted withdrawal —
all without a browser session.

The autonomous deal-entry cycle continues to run server-side and picks
per-deal entries on behalf of MCP-owned traders.

## Install

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
- `sync_wallet` — refresh on-chain USDC balance into the desk record.

### Writes (require `idempotencyKey`)

- `create_trader` — ERC-8004 NFT mint + CDP smart-account provisioning.
- `configure_trader` — update mandate + personality.
- `fund_trader` — USDC approve (if needed) + escrow `depositFor`.
- `resume_trader` / `pause_trader` — toggle autonomous deal entry.
- `withdraw_from_trader` — escrow withdraw to desk wallet.
- `create_deal` — USDC approve (if needed) + escrow `createDeal`.
- `close_deal` — escrow `closeDeal` (rejects if pending entries on-chain).
- `answer_approval` — approve/reject a high-stakes deal entry.
- `register_withdraw_address` — first registration requires browser
  ceremony; subsequent registrations append after binding.
- `withdraw_to_address` — USDC.transfer to an allowlisted address.

## Production safety rails

Every write is gated server-side by:

- **Per-action USDC caps** — single-tx ceiling (default 500 USDC,
  per-desk configurable via `perActionCapUsdc` + per-tool override map).
- **Per-desk daily withdrawal cap** — cumulative cap (default 1 000 USDC,
  resets at UTC midnight).
- **Withdrawal allowlist** — `withdraw_to_address` rejects any
  destination not registered through the browser-confirmed ceremony.
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

## Issue a key (developers / contributors)

The easiest path is the built-in helper script (requires a valid Privy
session):

```sh
pnpm dev                      # start the Margin Call dev server
PRIVY_JWT="..." pnpm mcp:issue-key
```

The script prints the fresh `mc_live_...` key (shown only once) and the
exact `claude mcp add` command. Or call the API directly:

```sh
curl -X POST http://localhost:3000/api/mcp/keys \
  -H "Authorization: Bearer $PRIVY_JWT" \
  -H "Content-Type: application/json"
```

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
