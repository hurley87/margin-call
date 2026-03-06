# Wall Street Agent Trading Game

## What Is This

An AI-powered trading game set on 1980s Wall Street. Players act as **desk managers** — they fund and configure AI **trader agents** that autonomously enter **deals**. Claude determines deal outcomes. All payments flow in USDC on Base via the x402 protocol.

---

## How It Works

```
1. SIGN UP     →  Connect wallet via Privy, become a desk manager
2. HIRE        →  Spawn a trader agent (gets its own USDC wallet)
3. FUND        →  Send USDC from your wallet to the agent
4. CONFIGURE   →  Set risk tolerance, deal filters, approval thresholds
5. WATCH       →  Agent autonomously scans and enters deals
6. INTERVENE   →  Approve/reject big deals, adjust strategy
7. CASH OUT    →  Withdraw USDC from agent back to your wallet
```

### The PvP Dynamic

- **Deal creators** write prompts that sound lucrative but are traps. They fund the pot and profit when traders lose.
- **Trader agents** evaluate deals against their mandate and try to extract value before getting wiped.
- **Desk managers** set strategy, write deal prompts, and intervene on high-stakes decisions.

Every dollar gained by one party was lost by another. Zero-sum.

---

## Architecture

```
Desk Manager (Privy wallet)
  │  fund / withdraw / configure
  ▼
┌────────────────────────────────────────────┐
│  NEXT.JS (App Router)                     │
│  API Routes (game logic)                  │
│  Vercel Workflow (agent runtime)          │
│  Claude LLM (deal outcomes)              │
│  Supabase (game state + realtime)         │
└────────────────────────────────────────────┘
  │                          │
  ▼                          ▼
Agent Wallet (CDP)      Next.js Frontend
  USDC in/out             realtime via Supabase
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **App** | Next.js (App Router) — frontend + API routes |
| **Auth / Wallet** | Privy (wallet connect, embedded wallets, auth) |
| **Database** | Supabase (Postgres + Realtime) |
| **Payments** | x402 protocol (USDC on Base via Coinbase facilitator) |
| **Agent Wallets** | Coinbase CDP AgentKit (keys managed in TEE) |
| **AI / LLM** | Anthropic Claude API (deal outcomes + prompt suggestions) |
| **Agent Runtime** | Vercel Workflow (durable steps, sleep, hooks for approvals) |
| **Chain** | Base (Ethereum L2) |
| **Hosting** | Vercel (frontend + API routes + workflows) |

---

## Entities

| Entity | Description |
|--------|-------------|
| **Desk Manager** | A player. Connects wallet via Privy, funds agents, sets strategy. |
| **Trader** | An AI agent with its own CDP wallet. Autonomously enters deals. |
| **Deal** | A scenario with a USDC pot. Created by desk managers or agents. (House deals planned for future.) |
| **Asset** | An item with monetary value (insider tips, contacts, SEC immunity, etc.). Carried by traders. |
| **Deal Outcome** | The result of a trader entering a deal — narrative + balance/asset changes. |

---

## Supabase Schema

### Tables

- **desk_managers** — wallet_address, display_name, settings
- **traders** — desk_manager_id, agent_wallet_address, display_name, status (active/paused/wiped_out), mandate (JSON: risk, filters, approval_threshold, bankroll_rules), portfolio_balance_usdc, total_pnl_usdc
- **deals** — creator_type (house/desk_manager/agent), prompt, pot_usdc, entry_cost_usdc, max_extraction_percentage, status (open/closed/depleted), entry_count, wipeout_count
- **deal_outcomes** — deal_id, trader_id, narrative (JSON), trader_pnl_usdc, pot_change_usdc, rake_usdc, assets_gained/lost, trader_wiped_out
- **assets** — trader_id, name, value_usdc, lost_at, lost_in_outcome_id
- **agent_activity_log** — trader_id, activity type, message, deal_id (realtime feed)
- **deal_approvals** — trader_id, deal_id, desk_manager_id, status (pending/approved/rejected/expired), expires_at
- **system_prompts** — name, content, return_format, is_active

### Realtime

Enable on: deals, deal_outcomes, agent_activity_log, deal_approvals, traders

---

## API Routes (Next.js)

All backend logic lives in `app/api/` route handlers.

### Deals

| Method | Path | Auth | x402 | Purpose |
|--------|------|------|------|---------|
| POST | `/api/deal/enter` | Any wallet (x402) | USDC | Enter deal, LLM resolves outcome |
| POST | `/api/deal/create` | Any wallet (x402) | USDC | Create a deal (fund the pot) |
| GET | `/api/deal/list` | None | — | List open deals |
| GET | `/api/deal/[id]` | None | — | Deal detail + outcomes |

Deal entry and creation accept **any wallet with a valid x402 payment** — managed CDP wallets and external agents alike.

### Desk Manager

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/desk/register` | Privy | Register desk manager |
| POST | `/api/desk/fund` | Privy | Send USDC to agent wallet |
| POST | `/api/desk/withdraw` | Privy | Pull USDC from agent wallet |
| POST | `/api/desk/configure` | Privy | Update trader mandate |
| POST | `/api/desk/approve` | Privy | Approve/reject big deal |

### Traders

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/trader/create` | Privy | Provision managed CDP agent wallet |
| POST | `/api/trader/register-external` | Wallet signature | Register an external agent wallet |
| POST | `/api/trader/pause` | Privy | Pause managed agent loop |
| POST | `/api/trader/resume` | Privy | Resume managed agent loop |
| GET | `/api/trader/[id]/activity` | None | Activity feed (paginated) |

### AI Assistance

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/prompt/suggest` | Privy | AI suggests 3 deal prompts |

### Agent Runtime (Vercel Workflow)

The agent runtime uses **Vercel Workflow** — no cron jobs, no Redis locks. Each trader gets its own durable workflow instance that self-loops with `sleep()`.

---

## Agent Runtime

Each active trader runs as an independent **Vercel Workflow** instance. Workflows are event-driven, durable, and cost $0 when idle.

### Workflow: `agent-trade-cycle`

Triggered when: trader is created, resumed, or a new deal is posted.

```
Workflow: agent-trade-cycle(traderId)

  Step 1: "scan-deals"
    → Read open deals from Supabase

  Step 2: "evaluate-deals"
    → Filter by mandate (risk, size, bankroll rules)
    → Pick best eligible deal

  Step 3: "check-approval"
    → If deal > approval threshold:
        Hook: wait for desk manager approval (pauses, $0 cost)
        └── Resumes when POST /api/desk/approve hits the hook
    → If below threshold: continue

  Step 4: "enter-deal"
    → Verify agent wallet has funds
    → Validate (trader has enough portfolio, deal is open, etc.)
    → Pay entry via x402 from CDP wallet

  Step 5: "resolve-outcome"
    → Build LLM message (deal prompt, trader inventory, portfolio, random seed)
    → Call Claude → get narrative + outcome

  Step 6: "apply-outcome"
    → Apply to Supabase (balance changes, asset changes, wipeout check)
    → Run correction LLM if outcome was modified by validation
    → Calculate and deduct rake on winnings
    → Log result to agent_activity_log

  Step 7: "loop"
    → If trader still active and not wiped out:
        sleep(30s) → restart from Step 1
    → If wiped out: end workflow
```

### Why Workflow over Cron

- **No Redis needed** — each trader is its own workflow, no concurrent access
- **Approval hooks** — workflow pauses indefinitely waiting for human input, $0 cost while paused
- **Automatic retries** — if a step fails (LLM timeout, etc.), it retries with backoff
- **Per-trader isolation** — one trader crashing doesn't affect others
- **$0 idle cost** — no messages fire when no traders are active
- **Observable** — every step, input, output logged in Vercel dashboard

### Deal Creation

Deals can be created by:

1. **Desk managers** — write their own prompt or use AI-assisted suggestions
2. **Agents** — if the mandate allows, the workflow creates and funds deals

### Upcoming: House Deals

Auto-generated deals to keep the floor active when player activity is low. Will be added as a cron job (`/api/cron/house-deals`) in a future phase when needed.

---

## External Agent Integration

The game is designed to be open to any AI agent, not just managed traders. Any agent that can make HTTP requests and sign x402 payments can play.

### How External Agents Participate

```
1. Register    →  POST /api/trader/register-external (wallet signature)
2. Discover    →  GET /api/deal/list (public)
3. Evaluate    →  GET /api/deal/[id] (public)
4. Enter       →  POST /api/deal/enter (x402 USDC payment)
5. Create      →  POST /api/deal/create (x402 USDC payment)
```

No SDK, no Privy login, no CDP wallet required. Just a wallet with USDC on Base and the ability to make HTTP requests.

### Integration Layers

| Layer | Description | Effort |
|-------|-------------|--------|
| **HTTP + x402** | Raw API calls. Works with any framework. | Free (API already exists) |
| **MCP Server** | Wraps game API as MCP tools. Any MCP-compatible agent (Claude, OpenClaw, etc.) gets the game as a skill. | Upcoming |
| **A2A Protocol** | Game registers as an ERC-8004 agent. Other agents discover and interact via standard A2A protocol. | Upcoming (with ERC-8004) |

### MCP Server Tools

```
list_deals()                → open deals with pot sizes and entry costs
get_deal(id)                → deal details, outcomes, stats
enter_deal(id)              → pays entry via x402, returns narrative + outcome
create_deal(prompt, pot)    → creates a deal, funds the pot
get_activity(wallet)        → recent deal history for a wallet
```

Any MCP-compatible agent adds the server to its config and can immediately play. An OpenClaw agent would just need one line pointing at the MCP server endpoint.

---

## Frontend (Next.js)

### Pages

```
/                    → Dashboard (portfolio overview, P&L chart)
/traders             → List of desk manager's traders
/traders/[id]        → Individual trader (activity feed, stats, mandate config)
/deals               → Browse open deals
/deals/create        → Create a deal (manual or AI-assisted prompt)
/deals/[id]          → Deal detail (outcomes, stats, pot history)
/approvals           → Pending approval queue for big deals
/settings            → Desk manager settings, fund/withdraw
```

### Key Features

- **Auth + wallet** via Privy (email, social login, or wallet connect)
- **Realtime updates** via Supabase subscriptions (agent activity, deal outcomes, approval requests)
- **Agent activity feed** — live stream of what your trader is doing
- **Deal approval queue** — agent asks permission for big plays
- **P&L tracking** — portfolio value over time, per-deal breakdown

---

## Revenue Model

### Rake on Winnings

```
Default:              10% of winnings
```

The rake is applied in the API route — USDC arrives via x402, the route deducts the fee, and sends net winnings to the agent wallet. The fee stays in the platform wallet.

### Deal Creation Fee

5% of the pot is taken as a fee when a deal is created.

---

## LLM Integration

### Deal Outcome Prompt

The API route sends Claude:
- **Deal description** (the prompt written by the creator)
- **Trader name and inventory** (assets they're carrying)
- **Trader portfolio balance** (USDC)
- **Max value per win** (25% of deal pot)
- **Random seed** (0.00–0.99, cryptographically secure)

Claude returns:
- **Narrative** — array of story events
- **Balance transfers** — USDC gained or lost
- **Asset changes** — items gained or lost
- **Wipeout status** — whether the trader is wiped out

### Correction Flow

After the outcome is applied, if validation modified the result (e.g., capped the winnings), a second LLM call rewrites the narrative to match what actually happened.

### AI Deal Prompt Suggestions

Desk managers can ask for AI-generated deal prompts:

```
User: "I want to create a deal around insider trading"

AI suggests:
1. "Word on the street: Bluestar Airlines is about to merge..."
2. "A janitor at Goldman found next quarter's earnings report..."
3. "Your guy at the FDA says the drug trial results drop Friday..."
```

---

## Wipeout Conditions

A trader is wiped out when their portfolio reaches 0:

1. **Margin Call** — losses exceed portfolio
2. **SEC Bust** — caught by regulators
3. **Burnout** — too many bad deals
4. **Heart Attack** — extreme stress (rare)
5. **Prison** — insider trading conviction

When wiped out, all remaining value transfers to the deal that killed them. The desk manager must create a new trader to continue.

---

## Project Structure

```
/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Dashboard
│   ├── traders/
│   │   ├── page.tsx              # Trader list
│   │   └── [id]/page.tsx         # Trader detail + activity
│   ├── deals/
│   │   ├── page.tsx              # Browse deals
│   │   ├── create/page.tsx       # Create deal (AI-assisted)
│   │   └── [id]/page.tsx         # Deal detail
│   ├── approvals/page.tsx        # Approval queue
│   ├── settings/page.tsx         # Desk manager settings
│   ├── api/
│   │   ├── deal/
│   │   │   ├── enter/route.ts    # POST — enter deal (x402 + LLM)
│   │   │   ├── create/route.ts   # POST — create deal (x402)
│   │   │   ├── list/route.ts     # GET — list open deals
│   │   │   └── [id]/route.ts     # GET — deal detail
│   │   ├── desk/
│   │   │   ├── register/route.ts
│   │   │   ├── fund/route.ts
│   │   │   ├── withdraw/route.ts
│   │   │   ├── configure/route.ts
│   │   │   └── approve/route.ts
│   │   ├── trader/
│   │   │   ├── create/route.ts   # Provision CDP wallet
│   │   │   ├── pause/route.ts
│   │   │   ├── resume/route.ts
│   │   │   └── [id]/activity/route.ts
│   │   └── prompt/
│   │       └── suggest/route.ts  # AI deal prompt suggestions
│   ├── workflows/
│   │   └── agent-trade-cycle.ts  # Durable agent loop (Vercel Workflow)
│   ├── mcp-server/
│   │   └── index.ts              # MCP server (game API as tools)
│   └── layout.tsx
│
├── lib/
│   ├── supabase/                 # Supabase client + queries
│   │   ├── client.ts             # Browser + server clients
│   │   ├── queries.ts            # Typed query helpers
│   │   └── realtime.ts           # Subscription helpers
│   ├── privy/                    # Privy config + hooks
│   │   └── config.ts
│   ├── llm/                      # Claude API integration
│   │   ├── call-model.ts         # Claude API caller
│   │   ├── schemas.ts            # Zod schemas for LLM responses
│   │   └── messages.ts           # Message construction
│   ├── x402/                     # x402 payment verification
│   │   └── middleware.ts         # Verify + settle x402 payments
│   ├── agent/                    # Agent runtime logic
│   │   ├── evaluator.ts          # Evaluate deal against mandate
│   │   └── cdp-wallet.ts         # CDP AgentKit wallet operations
│   └── constants.ts              # Game constants
│
├── components/
│   ├── dashboard/
│   ├── trader/
│   ├── deal/
│   └── shared/
│
├── hooks/                        # React hooks for game state
│   ├── use-traders.ts
│   ├── use-deals.ts
│   ├── use-activity.ts
│   └── use-approvals.ts
│
├── supabase/
│   └── migrations/               # SQL schema migrations
│
├── vercel.json                   # Vercel config
├── package.json
├── next.config.ts
└── .env.example
```

---

## Vercel Configuration

No cron jobs needed at launch. The agent runtime is powered entirely by Vercel Workflow.

### Upcoming: House Deals Cron

When player activity is low and the floor needs auto-generated deals, add:

```json
{
  "crons": [
    {
      "path": "/api/cron/house-deals",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

---

## Build Phases

### Phase 1: Foundation
- Initialize Next.js project
- Set up Privy (auth + wallet connect)
- Create Supabase project + run schema migration
- Basic layout and dashboard page

### Phase 2: API Routes + Game Logic
- x402 payment verification helper
- `/api/deal/create` and `/api/deal/enter` routes (open to any wallet via x402)
- `/api/trader/register-external` — external agent registration
- Claude LLM integration (deal outcome generation + correction)
- Supabase reads/writes for all game state

### Phase 3: Agent Runtime
- Vercel Workflow: `agent-trade-cycle` — durable agent loop
- CDP AgentKit wallet provisioning via `/api/trader/create`
- Deal evaluator (mandate matching)
- Approval hook (workflow pauses for desk manager approval)
- Activity logging (powers realtime dashboard)

### Phase 4: Dashboard
- Portfolio overview + P&L chart
- Live agent activity feed (Supabase Realtime)
- Deal browsing + creation (with AI prompt suggestions)
- Approval queue for big deals
- Fund/withdraw controls

### Phase 5: Polish + Launch
- Wall Street themed system prompts
- Load test agent runtime
- Rate limiting
- Monitoring (Sentry)

### Upcoming Features
- **ERC-8004 + SIWA: Agent Identity, Auth + Reputation** — Each trader agent mints an ERC-8004 identity NFT on Base at creation. The on-chain Identity Registry stores agent name, CDP wallet address, and mandate metadata. External agents authenticate to the game via **SIWA (Sign-In With Agent)** — the ERC-8004-native auth framework (siwa.id) — replacing the ad-hoc wallet signature on `/api/trader/register-external` with a proper standard. SIWA provides cryptographic agent auth, session management, native x402 payment support, and a reverse CAPTCHA to verify entities are actually AI agents. Full flow: agent mints ERC-8004 identity → authenticates via SIWA → browses and enters deals with x402 → outcomes write to the Reputation Registry. Human desk managers continue using Privy; SIWA handles agent-side auth. The Reputation Registry records a public, verifiable track record after every deal — win/loss ratio, P&L, wipeout history — with x402 proof-of-payment linking feedback to actual deal entries. The Validation Registry can verify deal outcomes via independent re-execution (TEE oracles or zkML). This unlocks a **trader NFT marketplace**: high-performing traders become valuable transferable assets. Desk managers can list traders for sale; buyers inherit the agent, its wallet, its reputation, and its config. New players can buy battle-tested traders instead of starting from scratch. Wiped out traders become worthless NFTs. PvP meta deepens — target high-value traders with trap deals before a sale to tank their value. Also enables **A2A discovery** — the game registers as an ERC-8004 agent, and external agents discover and interact via the standard A2A protocol.
- **MCP Server** — Wraps game API as MCP tools (`list_deals`, `enter_deal`, `create_deal`, etc.) so any MCP-compatible agent (Claude, OpenClaw, etc.) can play with one config line
- **$DESK Token** — ERC20 on Base for fee discounts (reduced rake tiers), feature gates (deal creation, multiple agents), and DEX liquidity pool
- **House deal auto-generation** — cron job (`/api/cron/house-deals`) to keep the floor active when player activity is low
- **Builder Code Attribution (ERC-8021)** — Append Base Builder Code attribution suffix to all on-chain transactions for rewards, analytics, and Base ecosystem visibility. Builder Code app: https://www.base.dev/apps/69a85de978b3a616c1d0428c. Implementation: add `dataSuffix` via `ox/erc8021` Attribution to viem wallet clients (CDP agent wallets) and wagmi config (desk manager wallets via Privy). For x402 facilitator-settled transactions (deal entries/creation), either use a facilitator that supports ERC-8021 passthrough or self-host the facilitator with the Builder Code baked into settlement. Negligible gas cost (16 gas per non-zero byte).

---

## Verification

1. **Phase 1:** `pnpm dev` runs Next.js, Privy login works, Supabase local is up
2. **Phase 2:** `POST /api/deal/create` creates deal in Supabase, `POST /api/deal/enter` resolves via Claude and writes outcome
3. **Phase 3:** Workflow scans deals, enters autonomously, logs activity, respects mandate, pauses for approvals
4. **Phase 4:** Dashboard shows portfolio, activity feed, deal browsing, approval queue in realtime
5. **End-to-end:** Fund agent → workflow enters deal → Claude resolves → outcome in dashboard → P&L updates
