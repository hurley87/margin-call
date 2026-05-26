# Margin Call MCP Plan

## Goal

Make Margin Call playable entirely from Claude Code or another MCP-compatible
agent. The agent acts as the desk manager through terminal tools. The web UI
remains useful for spectators, debugging, and a one-time withdrawal-address
registration ceremony, but is not required for gameplay.

The MCP surface exposes game verbs, not generic database or contract access.
Claude can hire traders, fund them, configure strategy, create deals, resume
and pause traders, inspect activity, and withdraw funds through a constrained
tool interface. The autonomous trader cycle continues to make per-deal entry
decisions — Claude does not enter deals directly.

## Product Model

Claude controls the desk manager. Traders remain the in-game autonomous agents.

```text
Claude Code
  -> Margin Call MCP server (npm package)
    -> dedicated MCP API (Next.js routes)
      -> Convex HTTP action (mcp/* namespace)
      -> CDP AgentKit (desk + trader wallets)
      -> Base contracts
```

The terminal is the primary interface:

- Claude reads open deals, trader state, balances, recent activity, and
  pending approvals.
- Claude creates and funds traders.
- Claude edits mandates and personality.
- Claude creates trap deals for rival desks.
- Claude resumes or pauses traders.
- Claude answers pending high-stakes approvals.
- Claude withdraws to an allowlisted address.
- The existing autonomous cycle evaluates and enters deals on behalf of
  MCP-owned traders.

## Architecture

### MCP Server

A small npm-published TypeScript package that exposes Margin Call tools and
resources to Claude Code. It holds no broad admin credentials — every tool
calls a dedicated game API endpoint with a per-desk MCP API key.

Suggested location:

```text
packages/mcp-server/
  src/
    index.ts
    auth.ts
    client.ts
    tools/
      desks.ts
      traders.ts
      deals.ts
      portfolio.ts
      activity.ts
```

Distribution: publish as `@margin-call/mcp-server`. Users install with:

```text
claude mcp add margin-call -- npx -y @margin-call/mcp-server
```

The API key is stored in Claude Code's MCP secrets, not in repo `.env` files.
For Phase 1–5 contributors can point at a local path; npm publish is part of
Phase 6.

### MCP API

A dedicated API namespace for terminal/agent gameplay, separate from
browser-authenticated routes:

```text
src/app/api/mcp/
  desks/route.ts
  desks/sync-wallet/route.ts
  desks/register-withdraw-address/route.ts
  desks/withdraw-to-address/route.ts
  portfolio/route.ts
  activity/route.ts
  approvals/route.ts
  approvals/answer/route.ts
  deals/route.ts
  deals/create/route.ts
  deals/close/route.ts
  traders/route.ts
  traders/create/route.ts
  traders/[id]/configure/route.ts
  traders/[id]/fund/route.ts
  traders/[id]/resume/route.ts
  traders/[id]/pause/route.ts
  traders/[id]/withdraw/route.ts
```

Browser routes continue using Privy user identity. MCP routes use a per-desk
API key (`Authorization: Bearer mc_live_…`) and map each credential to exactly
one MCP desk identity.

### Identity

One MCP credential maps to exactly one desk. The desk subject is:

```text
mcp:cdp-wallet:<walletId>
```

Each MCP desk maps to:

- a Convex `deskManagers` row
- a CDP AgentKit server wallet ID
- a wallet address
- a withdrawal address allowlist
- per-action and per-day USDC limits
- audit metadata

The MCP API upserts the desk row on first authenticated request. Existing
ownership checks are extended to treat `mcp:cdp-wallet:<walletId>` as a
first-class desk subject so MCP desks can own traders and deals without a
browser Privy session.

### Wallets

Both the desk and its traders use **Coinbase CDP AgentKit** server wallets
with TEE-managed keys. Privy is only used for browser-user auth, never on the
MCP path.

The MCP API — not Claude — asks CDP to sign and send transactions. Allowed
transactions are limited to Margin Call game actions:

- `USDC.approve` (to escrow only)
- `USDC.transfer` (to allowlisted withdrawal addresses only)
- escrow `createDeal`
- escrow `depositFor`
- escrow `withdraw`
- ERC-8004 trader mint + token-bound-account registration

There is no generic arbitrary-transaction tool in the MCP server.

### Convex Boundary

Browser Convex mutations are Privy-auth checked. MCP gameplay does not call
those mutations directly. The MCP Next.js route validates the MCP API key,
then calls a dedicated **Convex HTTP action** in a new `mcp/*` namespace,
passing a shared service token. The HTTP action:

- validates the service token
- resolves the MCP desk identity from the request
- verifies ownership
- enforces trading-hours rules
- enforces balance and funding requirements
- preserves idempotency
- calls shared internal mutations to update the same Convex tables used by
  the web UI

No existing browser-auth mutation gets a second auth path bolted on. The
`convex/mcp/*` namespace is the only translation point between MCP credentials
and Convex writes. Before implementing this, read
`convex/_generated/ai/guidelines.md` for the canonical HTTP-action and
internal-mutation patterns.

### Trader Contract Path

`create_trader` mints the same ERC-8004 NFT and provisions the same CDP
token-bound-account wallet that the web UI uses. MCP traders are
indistinguishable from web traders on-chain and in the autonomous cron cycle.
This is a multi-tx call and the slowest tool in the surface; the tool
description warns Claude to expect 5–15 second latency.

## Tools

### Desk Tools

**`get_desk`**

Returns the MCP desk wallet address, wallet USDC balance, trader count, open
deal count, recent P&L, **and** `pendingApprovals: { count, oldestAgeSeconds }`
so a single read tells Claude whether any high-stakes deals need attention.
Also returns a `summary` field that includes funding hints when balance is
zero (e.g. "Send USDC to `0x…` to fund this desk.").

**`sync_wallet`**

Reads on-chain wallet balances and updates the desk manager row.

**`register_withdraw_address`**

Submits a destination address for the allowlist. The first registration per
desk requires a one-time confirmation in the web UI (Privy-authenticated)
binding the human to the MCP desk. Subsequent registrations may be allowed
under a per-desk policy.

**`withdraw_to_address`**

Calls `USDC.transfer` from the desk wallet to an allowlisted address. Rejects
non-allowlisted destinations and amounts above the per-day cap.

### Trader Tools

**`list_traders`**

Returns the desk's traders with status, token ID, escrow balance, mandate,
recent P&L, wallet status, and latest activity.

**`create_trader`**

Mints the ERC-8004 NFT, provisions the CDP TBA wallet, and records the
trader in Convex. Inputs:

- `name`
- `mandate`
- `personality`

Returns the trader id, NFT token id, wallet address, and tx hashes.

**`configure_trader`**

Updates mandate and personality for an owned trader.

**`fund_trader`**

Approves USDC if needed, calls escrow `depositFor`, syncs the trader escrow
balance, and returns the transaction hash.

**`resume_trader`**

Activates an owned funded trader. Same server-side requirements as the web
app: wallet ready, funded, not wiped out, market open.

**`pause_trader`**

Pauses an owned trader.

**`withdraw_from_trader`**

Calls escrow `withdraw`, syncs balances, and returns the transaction hash.
Funds land in the desk wallet; use `withdraw_to_address` to move them out.

### Deal Tools

**`list_deals`**

Returns open deals with prompt, source headline, pot, entry cost, status,
creator type, entry count, and own-desk eligibility.

**`create_deal`**

Approves USDC if needed, calls escrow `createDeal`, records the on-chain deal
in Convex, and returns the Convex deal id, on-chain deal id, and tx hash.

**`close_deal`**

Closes an MCP-desk-owned deal if no pending entries remain.

### Activity Tools

**`get_activity`**

Returns recent desk or trader activity in chronological terminal-friendly
form.

**`get_outcomes`**

Returns recent outcomes, P&L, wipeouts, assets gained or lost, and
transaction hashes.

**`get_pending_approvals`**

Returns approvals awaiting desk action, including remaining TTL.

**`answer_approval`**

Approves or rejects a pending high-stakes deal for an owned trader. Approvals
not answered within their TTL are auto-rejected server-side so stale
approvals never block a trader's cycle.

## Safety Rails

The MCP API enforces game and money safety before it submits transactions.

- Per-desk MCP API keys, signed and rotatable.
- One MCP credential maps to exactly one desk wallet unless explicitly
  rotated.
- Allowlist contract addresses and function selectors (see Wallets).
- No arbitrary transaction tool.
- Per-action and per-day USDC caps (configurable per desk).
- Withdrawal destinations restricted to an allowlist registered via the web
  UI ceremony.
- Required idempotency keys on every write and on-chain endpoint (see API
  Design).
- Explicit errors when the market is closed.
- Own-desk deal blocking enforced in both selection and `recordVerifiedEntry`,
  with `mcp:cdp-wallet:<id>` recognized as a desk subject.
- Transaction simulation before submission where practical.
- Convex `mcpRequests` audit row for every write and on-chain action.
- Rate limits by desk and by IP.
- High-stakes spending decisions are made by Claude — no out-of-band human
  confirmation flow. Daily caps are the hard ceiling.

## API Design

Boring JSON routes with clear request and response shapes. Every write
endpoint requires `idempotencyKey`.

Example create-deal request:

```json
{
  "idempotencyKey": "mcp-2026-05-26-create-deal-001",
  "prompt": "A distressed airline merger rumor starts moving across the tape.",
  "potUsdc": 100,
  "entryCostUsdc": 10
}
```

Example response:

```json
{
  "ok": true,
  "dealId": "j57...",
  "onChainDealId": 42,
  "txHash": "0x...",
  "walletAddress": "0x...",
  "summary": "Created an open deal with 100 USDC pot and 10 USDC entry cost."
}
```

Every write route returns a concise `summary` field because Claude surfaces
it directly in terminal play.

### Idempotency Semantics

- Every write tool requires `idempotencyKey` (Claude generates a UUID per
  intended action).
- Server records `(deskId, key) -> { status, txHash, result }` in the
  `mcpRequests` table.
- Retry with the same key returns the cached result; the server **never**
  re-submits the underlying transaction.
- Retry with a _different_ key for the same intent is treated as a new
  action — the tool descriptions make this rule explicit so Claude reuses
  keys on timeout.
- TTL: 24 hours.

### Audit Log

Every MCP request writes a row to a new Convex table:

```text
mcpRequests:
  deskId, tool, requestBody, idempotencyKey,
  result, txHash?, durationMs, error?, timestamp
```

Writes and on-chain actions always log. Pure reads log with a tighter schema
(omit `requestBody`) to avoid bloat. The table is queryable from the Convex
dashboard and joinable to `deals` and `traders` by id.

## Web UI Surface

MCP-managed desks are visibly distinguished across The Wire, leaderboards,
deal cards, and trader rows with an `AGENT DESK` tag (and a small
terminal-cursor glyph). This keeps the game lore consistent, helps operators
debug, and lets us measure MCP-desk performance against browser desks.

The web UI also hosts the one-time withdrawal-address registration ceremony
(`register_withdraw_address` confirmation) and an operator view of
`mcpRequests` for debugging.

## Implementation Phases

### Phase 1: Read-Only MCP

- Add MCP API authentication and the `mcpRequests` audit table.
- Add `get_desk`, `list_traders`, `list_deals`, `get_activity`,
  `get_outcomes`, and `get_pending_approvals`.
- Build the MCP server (local-path install) and wire read-only tools.
- Verify Claude Code can inspect game state from terminal.

### Phase 2: MCP Desk Identity

- Add MCP desk upsert flow keyed on `mcp:cdp-wallet:<walletId>`.
- Provision CDP server wallets per MCP credential.
- Create or update Convex desk-manager rows for MCP subjects.
- Add `sync_wallet`.
- Extend ownership checks (including own-desk deal blocking) to recognize
  MCP desk subjects.
- Add the `AGENT DESK` badge across The Wire, leaderboards, and deal cards.

### Phase 3: Trader Management

- Implement `create_trader` (full ERC-8004 NFT + CDP TBA flow),
  `configure_trader`, `fund_trader`, `resume_trader`, `pause_trader`, and
  `withdraw_from_trader`.
- Enforce all ownership and funding checks server-side via the `mcp/*`
  Convex namespace.
- Confirm the existing autonomous cron cycle drives MCP-owned traders
  unchanged.

### Phase 4: Deal Creation

- Implement `create_deal` and `close_deal` through the CDP desk wallet.
- Record on-chain deal creation in Convex.
- Verify own-desk entry blocking between MCP-owned traders and MCP-created
  deals.

### Phase 5: Approvals and Strategy Loop

- Implement `get_pending_approvals` (with TTL) and `answer_approval`.
- Surface `pendingApprovals` in `get_desk` responses.
- Add server-side auto-reject on TTL expiry.
- Improve `summary` fields so Claude can reason about portfolio changes
  without re-reading raw state.

### Phase 6: Production Hardening

- Implement `register_withdraw_address` (with web UI confirmation ceremony)
  and `withdraw_to_address`.
- Per-desk daily caps and per-action limits.
- Transaction simulation and retry handling against the 24h idempotency
  cache.
- Wallet rotation and key revocation.
- API key management UI or operator command.
- Publish `@margin-call/mcp-server` to npm; document
  `claude mcp add margin-call`.
- End-to-end tests against a Base testnet deployment.

## Resolved Decisions

- **Wallet provider:** CDP AgentKit for desk and traders. Privy is for
  browser users only.
- **Claude's role:** desk manager only. Autonomous cron cycle continues to
  pick deals on behalf of traders.
- **Desk multiplicity:** one credential = one desk. Multi-desk users
  provision multiple credentials.
- **Funding bootstrap:** `get_desk` returns the wallet address and a "send
  USDC here" hint in the summary. No in-band deposit tool.
- **Cash-out:** `withdraw_to_address` with a per-desk allowlist registered
  via a one-time web UI ceremony.
- **Convex auth:** Next.js MCP route → Convex HTTP action with service
  token; new `mcp/*` Convex namespace owns all writes.
- **High-spend approval:** Claude decides; no human confirmation step.
  Daily caps are the hard ceiling.
- **Trader contract path:** same ERC-8004 NFT + CDP TBA as web traders.
- **Idempotency:** required key on every write, 24h cache, server never
  re-submits.
- **Distribution:** publish to npm in Phase 6; local-path install for
  earlier phases.
- **Approval surfacing:** `pendingApprovals` on `get_desk` + server-side
  TTL auto-reject.
- **Audit log:** Convex `mcpRequests` table; writes always logged, reads
  logged with a tighter schema.
- **UI visibility:** MCP desks tagged `AGENT DESK` across public-facing
  surfaces.

## Non-Goals

- Replacing the web UI.
- Replacing Privy browser auth for normal users.
- Giving Claude raw database access.
- Giving Claude raw arbitrary wallet transaction access.
- Letting Claude enter deals directly — the autonomous cron cycle owns
  per-deal entry decisions for MCP traders.
- Moving the trader decision loop into Claude Code.
- Out-of-band human confirmation channels (email/SMS/web confirm) for
  large spends.
