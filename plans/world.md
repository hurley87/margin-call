# Agent-First Architecture: World ID + AgentKit + CLI/MCP

**Reference:** https://newsworthy-app.vercel.app/

## Context

Margin Call is currently web-first: humans log in via Privy, click buttons, and a server-side Vercel Workflow runs the agent loop. This plan flips to an **agent-first** model inspired by the [Newsworthy protocol](https://newsworthy-app.vercel.app/agents.md):

- **Players interact via CLI or Claude Code (MCP)**, not a web UI
- **Agents run client-side** (local process), calling the server only for LLM deal resolution (oracle)
- **World ID + AgentKit** replaces Privy for auth and adds sybil resistance
- **Web dashboard becomes public** (no login) — it's for spectating, not playing

The game's zero-sum PvP makes sybil resistance critical. One person running 100 agents to play both sides of their own deals breaks the economy. AgentKit solves this by linking every agent to a unique verified human.

---

## Architecture Overview

```
Human (World App on phone)
  │
  │  World ID verification (QR scan)
  │
  ▼
CLI / Claude Code (MCP)                     Web Dashboard (public)
  │                                           │
  ├─ margin-call setup    (generate EOA)      ├─ /deals (browse)
  ├─ margin-call register (World ID)          ├─ /leaderboard
  ├─ margin-call fund     (show address)      ├─ /traders/[id]
  ├─ margin-call create-trader (mint NFT)     ├─ /deals/[id]
  ├─ margin-call play     (agent loop)        ├─ /activity (live feed)
  ├─ margin-call create-deal (trap deals)         ▲
  └─ margin-call withdraw                         │ Supabase Realtime
      │                                           │
      │ x402 + AgentKit auth                      │
      ▼                                           │
  ┌──────────────────────────────────────┐        │
  │  Next.js API (Server / Oracle)       │────────┘
  │  POST /api/deal/enter (LLM resolve)  │
  │  POST /api/trader/create (register)  │
  │  GET  /api/deal/list (public)        │
  │  Operator wallet → resolveEntry()    │
  └──────────┬───────────────────────────┘
             │
             ▼
  ┌──────────────────────────────────────┐
  │  Base (Sepolia → Mainnet)            │
  │  MarginCallEscrow contract           │
  │  ERC-8004 Identity + Reputation      │
  │  AgentBook (World ID proofs)         │
  └──────────────────────────────────────┘
```

---

## What Changes vs What Stays

### Remove

| Component               | Files                                        | Reason                                                     |
| ----------------------- | -------------------------------------------- | ---------------------------------------------------------- |
| Privy                   | `src/lib/privy/`, `@privy-io/*` deps         | Replaced by World ID + AgentKit                            |
| SIWA                    | `src/lib/siwa/`                              | Replaced by x402 + AgentKit auth on API routes             |
| CDP trader wallets      | `src/lib/cdp/`                               | Agent's own EOA replaces server-managed CDP smart accounts |
| Server-side agent cycle | `src/lib/agent/cycle.ts`, `/api/agent/cycle` | Agent loop moves client-side (CLI)                         |
| Privy middleware auth   | Privy token checks in route handlers         | Replaced by AgentKit middleware                            |

### Keep (unchanged or minor adaptation)

| Component                 | Files                                | Notes                                                                   |
| ------------------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| Escrow contract + ABI     | `src/lib/contracts/escrow.ts`        | No changes — checks `ownerOf(traderId)`, doesn't care about wallet type |
| Operator wallet           | `src/lib/contracts/operator.ts`      | Still calls `resolveEntry()` as oracle                                  |
| LLM integration           | `src/lib/llm/*`                      | Deal resolution stays server-side                                       |
| Deal evaluator            | `src/lib/agent/evaluator.ts`         | Moves into CLI package (same logic)                                     |
| Supabase schema + queries | `src/lib/supabase/*`                 | Add `world_id_nullifier` to desk_managers, otherwise unchanged          |
| Web UI components         | `src/components/*`, `src/app/` pages | Remove Privy login, make public                                         |
| React Query hooks         | `src/hooks/*`                        | Keep for web dashboard data fetching                                    |
| Rate limiting             | `src/middleware.ts`                  | Adapt to work alongside x402 middleware                                 |

### New

| Component             | Location                       | Purpose                                      |
| --------------------- | ------------------------------ | -------------------------------------------- |
| CLI package           | `packages/cli/`                | `margin-call` standalone CLI                 |
| MCP Server            | `packages/mcp-server/`         | Wraps CLI tools for Claude Code              |
| AgentKit middleware   | `src/lib/agentkit/`            | x402 + AgentKit auth on protected API routes |
| World ID registration | `packages/cli/src/register.ts` | AgentBook registration flow                  |

---

## Phase 1: AgentKit API Middleware

Replace Privy/SIWA auth on API routes with x402 + AgentKit.

### New files

- `src/lib/agentkit/middleware.ts` — x402 + AgentKit middleware for Next.js API routes
- `src/lib/agentkit/storage.ts` — AgentKit storage implementation (Supabase-backed, replaces `InMemoryAgentKitStorage`)
- `src/lib/agentkit/config.ts` — Network config, AgentBook verifier, facilitator client

### Integration pattern (from AgentKit docs)

```typescript
// src/lib/agentkit/middleware.ts
import { HTTPFacilitatorClient } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import {
  agentkitResourceServerExtension,
  createAgentBookVerifier,
  createAgentkitHooks,
  declareAgentkitExtension,
} from "@worldcoin/agentkit";
import { SupabaseAgentKitStorage } from "./storage";

const BASE = "eip155:8453";
const agentBook = createAgentBookVerifier({ network: "world" });
const storage = new SupabaseAgentKitStorage(); // per-human usage tracking

const hooks = createAgentkitHooks({
  agentBook,
  storage,
  mode: { type: "free-trial", uses: 3 },
});
```

### Route protection

- **Protected** (x402 + AgentKit): `POST /api/deal/enter`, `POST /api/trader/create`, `POST /api/deal/create`, `POST /api/desk/register`
- **Public** (no auth): `GET /api/deal/list`, `GET /api/deal/[id]`, `GET /api/leaderboard`, `GET /api/activity/global`

### Anti-self-dealing

In `/api/deal/enter`, after AgentKit resolves the human ID:

- Look up deal creator's `world_id_nullifier` from Supabase
- Compare with entering agent's resolved human ID
- Reject if same human is on both sides

### Dependencies to add

```
@worldcoin/agentkit
@x402/core
@x402/evm
```

### Dependencies to remove

```
@privy-io/react-auth
@privy-io/server-auth
@privy-io/wagmi
@buildersgarden/siwa
@coinbase/cdp-sdk
```

---

## Phase 2: CLI Package (`margin-call`)

Standalone CLI that is the primary way to play. Follows the Newsworthy pattern.

### Structure

```
packages/cli/
  src/
    index.ts          # CLI entry point (commander/yargs)
    setup.ts          # Generate EOA keypair → ~/.margin-call/agent.key
    register.ts       # World ID registration via AgentBook
    fund.ts           # Show wallet address, check balances
    create-trader.ts  # Mint ERC-8004 NFT from agent's EOA
    create-deal.ts    # Create deal on escrow contract
    play.ts           # Agent loop (scan → evaluate → enter → report)
    deposit.ts        # Deposit USDC into escrow for a trader
    withdraw.ts       # Withdraw USDC from escrow
    status.ts         # Show trader status, balance, recent outcomes
    config.ts         # Wallet loading, RPC config, API base URL
    evaluator.ts      # Reuse from src/lib/agent/evaluator.ts
  package.json
  tsconfig.json
```

### Key commands

```bash
# First time setup
margin-call setup                          # Generate EOA, save to ~/.margin-call/agent.key
margin-call register                       # World ID verification (QR → World App → AgentBook)
margin-call fund                           # Show wallet address + USDC/ETH balances

# Playing
margin-call create-trader "Gordon" \
  --risk aggressive \
  --max-entry 10 \
  --approval-threshold 50                  # Mint ERC-8004 NFT, register in game

margin-call deposit --trader 42 --amount 100  # Deposit USDC into escrow
margin-call play --trader 42                  # Start autonomous agent loop
margin-call play --trader 42 --once           # Run single cycle (debug)

# Deal creation (trap deals)
margin-call create-deal \
  --prompt "Bluestar Airlines merger..." \
  --pot 100 \
  --entry-cost 5                           # Create deal on escrow contract

# Management
margin-call status --trader 42             # Balance, P&L, recent outcomes
margin-call withdraw --trader 42 --amount 25
margin-call pause --trader 42
margin-call resume --trader 42
```

### Agent loop (`play` command)

Runs as a long-lived process. Reuses evaluator logic from `src/lib/agent/evaluator.ts`:

```
loop:
  1. GET /api/deal/list → open deals
  2. Evaluate against mandate (local, no API call)
  3. Check balance (read escrow contract or API)
  4. If best deal > approval threshold → prompt human in terminal (y/n)
  5. POST /api/deal/enter (with x402 + AgentKit headers)
  6. Print outcome: "Gordon entered 'FDA insider tip' — won $12.50"
  7. Sleep 30s → restart
```

### Registration flow (following Newsworthy)

```
1. CLI calls POST /api/register/session → gets session ID
2. Displays QR code / deep link for World App
3. Polls GET /api/register/session/:id until verified
4. Submits registration tx to AgentBook on-chain
5. Stores nullifier hash locally + in desk_managers table
```

### New API routes needed

- `POST /api/register/session` — create World ID registration session
- `GET /api/register/session/[id]` — poll session status

---

## Phase 3: MCP Server

Wraps CLI commands as MCP tools for Claude Code integration.

### Structure

```
packages/mcp-server/
  src/
    index.ts          # MCP server entry
    tools.ts          # Tool definitions wrapping CLI functions
  package.json
```

### MCP tools

```
margin-call:setup          → generate keypair
margin-call:register       → World ID registration (returns QR code URL)
margin-call:fund           → show address + balances
margin-call:create-trader  → mint NFT with name + mandate
margin-call:deposit        → fund trader escrow balance
margin-call:play           → start agent loop (long-running)
margin-call:create-deal    → create deal with prompt + pot
margin-call:status         → trader status + balance + recent outcomes
margin-call:withdraw       → pull USDC from escrow
margin-call:list-deals     → browse open deals
margin-call:approve        → approve pending deal entry
```

### Claude Code usage

```json
{
  "mcpServers": {
    "margin-call": {
      "command": "npx",
      "args": ["margin-call-mcp"],
      "env": {
        "MARGIN_CALL_PRIVATE_KEY": "0x...",
        "MARGIN_CALL_API_URL": "https://margincall.gg"
      }
    }
  }
}
```

Human says: "Set up Margin Call and trade aggressively"
Claude Code: runs setup → register → fund → create-trader → play

---

## Phase 4: Web Dashboard (Public, No Login)

Remove Privy auth. All pages become public read-only views powered by Supabase data + Realtime.

### Changes

- Remove `PrivyProvider` from root layout
- Remove `@privy-io/*` packages
- Remove wallet connect buttons / auth guards
- All pages are public: deals, leaderboard, trader profiles, activity feed
- Supabase Realtime still powers live updates (no auth needed for public subscriptions)

### Pages (no changes to routing, just remove auth gates)

```
/                    → Live dashboard (active deals, recent outcomes, volume)
/deals               → Browse open deals
/deals/[id]          → Deal detail + outcome history
/traders/[id]        → Trader profile (reputation, P&L, activity)
/leaderboard         → Rankings
/activity            → Global activity feed
```

### Optional future: World ID MiniKit for web

If personalized web views are wanted later (e.g. "my traders"), World ID MiniKit can be added as a lightweight web auth layer. Not in scope for this plan.

---

## Phase 5: Database Migration

### New migration: `017_world_id_auth.sql`

```sql
-- Add World ID nullifier hash to desk managers
ALTER TABLE desk_managers ADD COLUMN world_id_nullifier TEXT UNIQUE;

-- Add agent wallet address (EOA) to traders (replaces cdp_owner_address / cdp_wallet_address)
ALTER TABLE traders ADD COLUMN agent_address TEXT;

-- AgentKit usage tracking (replaces InMemoryAgentKitStorage)
CREATE TABLE agentkit_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL,
  human_id TEXT NOT NULL,  -- anonymous World ID identifier
  count INT NOT NULL DEFAULT 0,
  UNIQUE(endpoint, human_id)
);

CREATE TABLE agentkit_nonces (
  nonce TEXT PRIMARY KEY,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- World ID registration sessions
CREATE TABLE registration_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, verified, expired
  proof_data JSONB,
  nullifier_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '10 minutes')
);
```

---

## Phase 6: Remove Deprecated Code

After Phases 1-5 are working:

1. Delete `src/lib/privy/` (config.ts, server.ts, tests)
2. Delete `src/lib/siwa/` (verify.ts, sign.ts, nonce-store.ts)
3. Delete `src/lib/cdp/` (client.ts, trader-wallet.ts, register-operator.ts, send-contract-call.ts)
4. Delete `src/lib/agent/cycle.ts` (replaced by CLI play command)
5. Delete `/api/agent/cycle` route (no more server-side cycles)
6. Delete `/api/siwa/nonce` route
7. Remove Privy-related env vars: `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`
8. Remove CDP-related env vars: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`
9. Update `src/middleware.ts` — remove Privy-specific comments, keep rate limiting

---

## Monorepo Structure

Convert to pnpm workspace:

```
/
├── packages/
│   ├── cli/                    # margin-call CLI (npm package)
│   │   ├── src/
│   │   └── package.json
│   ├── mcp-server/             # MCP server (npm package)
│   │   ├── src/
│   │   └── package.json
│   └── shared/                 # Shared types, evaluator, constants
│       ├── src/
│       └── package.json
├── src/                        # Next.js app (web dashboard + API)
│   ├── app/
│   ├── lib/
│   └── ...
├── pnpm-workspace.yaml
└── package.json
```

`packages/shared/` contains code used by both CLI and web:

- `evaluator.ts` (deal evaluation logic)
- `constants.ts` (fee rates, timings)
- Types (deal, trader, mandate, outcome)

---

## Verification

1. **CLI setup + register**: `margin-call setup` creates keypair, `margin-call register` opens World ID flow, agent address appears in AgentBook
2. **CLI play**: `margin-call create-trader "Gordon" --risk aggressive` mints NFT, `margin-call deposit --trader 42 --amount 50` funds escrow, `margin-call play --trader 42` enters deals and prints outcomes
3. **Anti-sybil**: Same World ID trying to enter their own deal gets rejected by `/api/deal/enter`
4. **Web dashboard**: Visit `/deals` — see live deals, outcomes, leaderboard with no login required
5. **MCP**: Add `margin-call` MCP server to Claude Code config, tell Claude "play Margin Call", it runs the full setup flow
6. **End-to-end**: CLI creates trader → deposits USDC → play loop enters deal → server resolves via GPT-5 mini → escrow settles → reputation posted → web dashboard shows outcome in realtime
