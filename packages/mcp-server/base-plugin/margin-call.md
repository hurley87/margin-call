---
title: "Margin Call Plugin"
description: "Skill plugin reference for running an autonomous AGENT DESK in the Margin Call 1980s Wall Street trading game via the Margin Call MCP HTTP API and Base MCP treasury execution."
---

# Margin Call Plugin

> [!IMPORTANT]
>
> ## STOP — COMPLETE ONBOARDING BEFORE USING THIS PLUGIN
>
> Before calling any Margin Call endpoint, you MUST complete the Base MCP onboarding flow defined in `SKILL.md`:
>
> 1. Confirm Base MCP tools are available (Detection).
> 2. Present the Base Account disclaimer (Onboarding).
> 3. Call `get_wallets` when you need the user's Base Account address (required for `set_desk_wallet` and treasury writes).
>
> Then complete the Margin Call desk handshake:
>
> 1. `GET /api/mcp/desks` — confirm desk state and whether a wallet is bound.
> 2. If no wallet is bound: `POST /api/mcp/desks/set-wallet` with the Base Account address from `get_wallets`.
> 3. `GET /api/mcp/desks/sync-wallet` — refresh on-chain USDC balance after funding the Base Account.
>
> Every Margin Call API call requires `Authorization: Bearer mc_live_...` (one key = one AGENT DESK). Obtain a key from the Margin Call web app or `POST /api/mcp/keys` while authenticated via Privy.

Margin Call is an AI-powered PvP trading game on 1980s Wall Street. This plugin drives the Margin Call MCP HTTP API: read desk/trader/deal state, hire and configure traders, and execute treasury actions (fund escrow, create/close deals, withdraw) through Base MCP's `send_calls`. The autonomous deal-entry cycle runs server-side for active funded traders.

**Chain:** Base Sepolia (`base-sepolia`)

**Escrow contract:** `0x8AA5768AC08755cd9AEf07892e6c40edD1B5a609`

**USDC (Base Sepolia):** `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

---

## Environment and HTTP routing

| Variable              | Description                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `MARGIN_CALL_API_URL` | Margin Call API base URL (e.g. `https://your-app.example.com` or `http://localhost:3000`). No trailing slash. |
| `MARGIN_CALL_MCP_KEY` | Per-desk Bearer token (`mc_live_...`). Required on every request.                                             |

**HTTP tool requirement:** The Margin Call API host is **not** on the Base MCP `web_request` allowlist. All reads and writes require **Bearer auth**; treasury prepare endpoints require **POST** with a JSON body. Use the harness's direct HTTP tool (Claude Code, Cursor, Codex) — **do not** route Margin Call calls through Base MCP `web_request`.

**Not supported on chat-only surfaces:** Claude.ai and ChatGPT consumer apps cannot perform authed POST to arbitrary hosts. On those surfaces, install the standalone `@margin-call/mcp-server` stdio MCP instead of this plugin.

**Idempotency:** Every write requires a stable `idempotencyKey` (min 8 chars, e.g. a UUID). Reusing the same key within 24 h replays the cached result without re-submitting on-chain transactions.

---

## Reads (GET)

All read endpoints accept optional query params where noted. Include headers on every call:

```http
Authorization: Bearer mc_live_...
Accept: application/json
```

### `GET /api/mcp/desks`

Desk overview: wallet address, on-chain USDC balance, trader count, open deals you created, recent P&L, pending high-stakes approvals count + age, and a terminal-friendly `summary` string. **Call this first** on every session or before any write decision.

### `GET /api/mcp/traders?limit=<n>`

Owned traders with status (`active` / `paused` / `wiped_out`), ERC-8004 `tokenId`, escrow balance, mandate, personality, wallet status, CDP address, recent 30d P&L, activity snippet, and portrait URL. Default `limit=20`, max 50.

### `GET /api/mcp/traders/check-name?name=<handle>`

Validate a proposed trader handle before `create_trader`. Returns `valid`, `available`, optional `reason`, `normalized`, and `summary`. Same rules as the web app: letters, digits, underscore, max 15 chars; globally unique case-insensitively. Ask the user for the name, check here, then create only when `available` is true.

### `GET /api/mcp/deals?limit=<n>&includeClosed=true`

Open market deals (and optionally closed). Each entry includes prompt, headline, pot, entry cost, status, creator type, entry count, and **`eligibleForMe`** (`false` for deals your own desk created — your traders cannot enter those).

### `GET /api/mcp/activity?traderId=<id>&limit=<n>`

Recent chronological activity for the desk or a single trader. Returns structured rows and a `lines[]` array of terminal-friendly strings.

### `GET /api/mcp/outcomes?traderId=<id>&limit=<n>`

Recent resolved deal outcomes: P&L, wipeouts, assets gained/lost, on-chain tx hashes.

### `GET /api/mcp/approvals?limit=<n>`

High-stakes deal approvals awaiting your decision, with remaining TTL in seconds. Use when `get_desk` shows `pendingApprovals.count > 0`.

### `GET /api/mcp/desks/sync-wallet`

Reads live on-chain USDC balance for the bound Base Account and writes it into the desk record. Call after funding your Base Account and after every treasury confirm.

---

## Prepare-calldata (POST treasury)

These endpoints return unsigned calldata for Base MCP execution. All require `idempotencyKey` in the JSON body.

**Prepare response shape:**

```json
{
  "phase": "prepare",
  "intentId": "<convex intent id>",
  "chain": "base-sepolia",
  "calls": [{ "to": "0x...", "value": "0x0", "data": "0x..." }],
  "instructions": "Execute via Base MCP send_calls ...",
  "summary": "Human-readable summary of the intended action"
}
```

If the same `idempotencyKey` was already confirmed, the response includes `"cached": true` and the prior confirm result instead of a new prepare envelope.

### `POST /api/mcp/traders/{traderId}/fund`

Fund a trader's escrow from your Base Account (batched `approve` + `depositFor` when needed).

```json
{
  "amountUsdc": 50,
  "idempotencyKey": "<stable-uuid>"
}
```

### `POST /api/mcp/traders/{traderId}/withdraw`

Withdraw USDC from trader escrow back to your Base Account.

```json
{
  "amountUsdc": 25,
  "idempotencyKey": "<stable-uuid>"
}
```

### `POST /api/mcp/deals/create`

Create a market deal (trap for rivals). Your own traders cannot enter deals you create.

```json
{
  "prompt": "Hostile takeover of Acme Corp",
  "potUsdc": 100,
  "entryCostUsdc": 10,
  "idempotencyKey": "<stable-uuid>"
}
```

Requires market open (Mon–Fri 09:30–16:00 ET) and desk balance ≥ `potUsdc`.

### `POST /api/mcp/deals/close`

Close an owned open deal (pot returns to your Base Account). Fails if pending on-chain entries remain.

```json
{
  "dealId": "<convex deal id>",
  "idempotencyKey": "<stable-uuid>"
}
```

---

## send_calls mapping and confirm loop

After any prepare response with `"phase": "prepare"`, execute the treasury flow:

```
1. POST prepare endpoint → { phase, intentId, chain, calls[] }
2. send_calls(chain=<chain>, calls=<calls[]>) → approvalUrl + requestId
3. User approves in Base Account
4. get_request_status(requestId) → txHash when confirmed
5. POST /api/mcp/intents/confirm { intentId, txHash }
6. GET /api/mcp/desks/sync-wallet
```

### Mapping prepared calls to Base MCP

Pass `chain` and `calls[]` from the prepare response **verbatim** into Base MCP's batched-calls tool:

```json
{
  "chain": "base-sepolia",
  "calls": [
    {
      "to": "<call.to>",
      "value": "<call.value or 0x0>",
      "data": "<call.data>"
    }
  ]
}
```

When the prepare response includes multiple calls (e.g. `approve` + `depositFor`), pass the **full array** in one `send_calls` batch — the user approves once and all calls execute atomically. See [../references/batch-calls.md](../references/batch-calls.md) and [../references/approval-mode.md](../references/approval-mode.md).

### Confirm intent

After `get_request_status` returns a confirmed transaction hash:

```http
POST /api/mcp/intents/confirm
Authorization: Bearer mc_live_...
Content-Type: application/json

{
  "intentId": "<intentId from prepare>",
  "txHash": "<hash from get_request_status>"
}
```

The confirm response includes game state updates (e.g. `dealId`, escrow balance). Always call `sync_wallet` after confirm so the desk balance reflects the on-chain change.

---

## Direct POST writes (no send_calls)

These actions execute server-side without Base MCP approval:

### `POST /api/mcp/desks/set-wallet`

Bind your Base Account to this desk. Required once before treasury ops or `create_trader`.

```json
{ "walletAddress": "0x..." }
```

### `POST /api/mcp/traders/create`

Hire a trader (ERC-8004 NFT mint + identity wallet; gas sponsored server-side). Requires bound wallet, positive balance, and `sync_wallet`.

```json
{
  "name": "Gekko",
  "mandate": { "bankroll_pct": 0.1 },
  "personality": "Aggressive 80s trader",
  "idempotencyKey": "<stable-uuid>"
}
```

### `POST /api/mcp/traders/{traderId}/configure`

Update mandate and personality. Does not change on-chain state.

```json
{
  "mandate": { "bankroll_pct": 0.15 },
  "personality": "Updated personality",
  "idempotencyKey": "<stable-uuid>"
}
```

### `POST /api/mcp/traders/{traderId}/resume`

Activate a trader for the autonomous deal cycle. Requires wallet ready, escrow balance > 0, not wiped out, market open.

```json
{ "idempotencyKey": "<stable-uuid>" }
```

### `POST /api/mcp/traders/{traderId}/pause`

Pause autonomous deal entry.

```json
{ "idempotencyKey": "<stable-uuid>" }
```

### `POST /api/mcp/approvals/answer`

Approve or reject a pending high-stakes deal approval. `approve` schedules an immediate trader cycle.

```json
{
  "approvalId": "<from get_pending_approvals>",
  "decision": "approve",
  "reason": "Optional audit reason",
  "idempotencyKey": "<stable-uuid>"
}
```

---

## Orchestration (full desk onboarding)

```
get_wallets → Base Account address
GET /api/mcp/desks → check binding + balance
(if zero balance) user funds Base Account with USDC on Base Sepolia
POST /api/mcp/desks/set-wallet { walletAddress }
GET /api/mcp/desks/sync-wallet
GET /api/mcp/traders/check-name?name=<handle>  (user picks name; must be available)
POST /api/mcp/traders/create { name, idempotencyKey }
POST /api/mcp/traders/{id}/fund { amountUsdc, idempotencyKey } → prepare
send_calls → user approves → get_request_status → confirm_intent → sync_wallet
POST /api/mcp/traders/{id}/resume { idempotencyKey }
(autonomous cron picks deals for active traders)
```

---

## Example prompts

**Show me my desk**

1. `GET /api/mcp/desks`.
2. Summarize wallet, balance, trader count, pending approvals, and recent P&L from `summary`.

**Hire and fund a trader named Gekko with $50**

1. `GET /api/mcp/desks` — confirm wallet bound and balance ≥ 50 USDC; if not, guide user through set-wallet + sync-wallet + funding.
2. Ask the user for the handle; `GET /api/mcp/traders/check-name?name=Gekko` — only proceed when `available` is true.
3. `POST /api/mcp/traders/create` with stable `idempotencyKey`.
4. `POST /api/mcp/traders/{traderId}/fund` with `amountUsdc: 50`.
5. Map `calls[]` to `send_calls`, open approval URL, poll status, `confirm_intent`, `sync_wallet`.
6. `POST /api/mcp/traders/{traderId}/resume`.

**Create a $100 trap deal**

1. `GET /api/mcp/desks` — confirm balance ≥ 100 and market is open.
2. `POST /api/mcp/deals/create` with prompt, pot, entry cost, and `idempotencyKey`.
3. Prepare → `send_calls` → approve → confirm → sync_wallet.

**Answer pending approvals**

1. `GET /api/mcp/approvals`.
2. Present each approval (trader, deal prompt, pot, TTL).
3. On user decision: `POST /api/mcp/approvals/answer` with `decision: "approve"` or `"reject"`.

---

## Safety rules

- Never ask for or use a private key. Treasury execution goes only through Base MCP `send_calls`.
- One `mc_live_*` key = one desk. Treat the key as a secret; rotate via the web operator dialog if compromised.
- Always use a stable `idempotencyKey` per user intent. On retry after a network error, reuse the same key — do not mint a new one.
- Do not split batched prepare calls into sequential single sends when the prepare response returns multiple calls.
- Own-desk traders cannot enter deals created by the same desk (`eligibleForMe: false`). Do not attempt to bypass this.
- Per-action USDC caps (default 500 USDC), rate limits, market hours, and transaction simulation are enforced server-side. Surface error messages verbatim.
- The autonomous deal-entry cycle owns per-deal entry decisions; you cannot enter deals directly — only fund traders and answer high-stakes approvals.
- After any treasury confirm, always `sync_wallet` before making balance-dependent decisions.

---

## Alternative: standalone MCP server

On surfaces without a harness HTTP tool (Claude.ai, ChatGPT consumer apps), or when you prefer tool-based discovery over HTTP, install the standalone stdio MCP:

```bash
claude mcp add margin-call -- npx -y @margin-call/mcp-server
```

Set `MARGIN_CALL_MCP_KEY` and optionally `MARGIN_CALL_API_URL`. The server exposes the same operations as named MCP tools (`get_desk`, `fund_trader`, `confirm_intent`, etc.) and still requires Base MCP for treasury approval.

---

## Fetching this spec

Canonical file: `packages/mcp-server/base-plugin/margin-call.md` in the Margin Call repo.

When deployed, the spec is also available unauthenticated at:

```http
GET {MARGIN_CALL_API_URL}/api/mcp/plugin
```

Copy the markdown into your local `base-mcp/plugins/margin-call.md` skill directory, or point the agent at the URL on harness surfaces with HTTP access.
