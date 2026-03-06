# Plan: Margin Call

> Source PRD: `docs/wall-street-agent-game.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **Framework**: Next.js 16 (App Router), React 19, TypeScript strict mode
- **Auth/Wallet**: Privy (desk managers), wallet signature (external agents)
- **Database**: Supabase Postgres + Realtime subscriptions
- **Payments**: x402 protocol (USDC on Base via Coinbase facilitator)
- **Agent Wallets**: Coinbase CDP AgentKit (TEE-managed keys)
- **AI/LLM**: OpenAI GPT-5 mini (structured outputs via `openai` SDK)
- **Agent Runtime**: Vercel Workflow (durable steps, sleep, hooks)
- **Styling**: Tailwind CSS v4, shadcn/ui pattern, Lucide icons
- **Path alias**: `@/*` maps to `./src/*`

- **Routes (API)**:
  - `POST /api/desk/register` — register desk manager
  - `POST /api/desk/fund` — fund agent wallet
  - `POST /api/desk/withdraw` — withdraw from agent wallet
  - `POST /api/desk/configure` — update trader mandate
  - `POST /api/desk/approve` — approve/reject deal
  - `POST /api/deal/create` — create deal (x402)
  - `POST /api/deal/enter` — enter deal (x402)
  - `GET /api/deal/list` — list open deals
  - `GET /api/deal/[id]` — deal detail + outcomes
  - `POST /api/trader/create` — provision CDP agent wallet
  - `POST /api/trader/register-external` — register external agent
  - `POST /api/trader/pause` — pause agent loop
  - `POST /api/trader/resume` — resume agent loop
  - `GET /api/trader/[id]/activity` — activity feed (paginated)
  - `POST /api/prompt/suggest` — AI deal prompt suggestions

- **Routes (Pages)**:
  - `/` — Dashboard (portfolio overview, P&L)
  - `/traders` — Trader list
  - `/traders/[id]` — Trader detail + activity feed
  - `/deals` — Browse open deals
  - `/deals/create` — Create a deal
  - `/deals/[id]` — Deal detail + outcomes
  - `/approvals` — Pending approval queue
  - `/settings` — Desk manager settings

- **Schema (Supabase tables)**:
  - `desk_managers` — wallet_address, display_name, settings
  - `traders` — desk_manager_id, agent_wallet_address, display_name, status, mandate (JSON), portfolio_balance_usdc, total_pnl_usdc
  - `deals` — creator_type, prompt, pot_usdc, entry_cost_usdc, max_extraction_percentage, status, entry_count, wipeout_count
  - `deal_outcomes` — deal_id, trader_id, narrative (JSON), trader_pnl_usdc, pot_change_usdc, rake_usdc, assets_gained/lost, trader_wiped_out
  - `assets` — trader_id, name, value_usdc, lost_at, lost_in_outcome_id
  - `agent_activity_log` — trader_id, activity_type, message, deal_id
  - `deal_approvals` — trader_id, deal_id, desk_manager_id, status, expires_at
  - `system_prompts` — name, content, return_format, is_active

- **Key constants**:
  - Rake: 10% of winnings
  - Deal creation fee: 5% of pot
  - Max value per win: 25% of deal pot
  - Agent loop interval: 30s sleep between cycles

---

## Phase 1: Auth + Desk Manager Registration

**User stories**: Sign up, connect wallet via Privy, become a desk manager

### What to build

A complete auth flow: Privy integration for wallet connect / email / social login, a registration API route that writes to the `desk_managers` Supabase table, and a basic dashboard page that shows the logged-in desk manager's info. This is the foundation every other phase builds on.

### Acceptance criteria

- [ ] Privy provider configured in the app layout
- [ ] User can connect wallet (or use email/social) and authenticate
- [ ] `POST /api/desk/register` creates a row in `desk_managers`
- [ ] Supabase project connected with `desk_managers` table migrated
- [ ] Dashboard (`/`) shows the authenticated desk manager's wallet address and display name
- [ ] Unauthenticated users are redirected to login

---

## Phase 2: Create & Browse Deals

**User stories**: Create a deal (fund the pot), browse open deals, view deal detail

### What to build

The deal creation and browsing flow end-to-end. A desk manager creates a deal by writing a prompt and funding a USDC pot via x402 payment. The deal is stored in Supabase. Anyone can browse open deals and view deal details. This establishes the x402 payment pattern used throughout the game.

### Acceptance criteria

- [ ] `deals` table migrated in Supabase
- [ ] `POST /api/deal/create` accepts x402 USDC payment, deducts 5% creation fee, stores deal in Supabase
- [ ] x402 payment verification middleware implemented and reusable
- [ ] `GET /api/deal/list` returns open deals with pot sizes and entry costs
- [ ] `GET /api/deal/[id]` returns deal detail including outcomes
- [ ] `/deals` page displays list of open deals
- [ ] `/deals/create` page has form for prompt + pot amount
- [ ] `/deals/[id]` page shows deal detail

---

## Phase 3: Enter a Deal + LLM Resolution

**User stories**: Enter a deal, GPT-5 mini resolves outcome, see narrative and P&L changes

### What to build

The core game mechanic: entering a deal triggers an x402 payment, then GPT-5 mini generates a structured outcome (narrative, balance changes, asset changes, wipeout status). A correction flow rewrites the narrative if validation modifies the result. The outcome is stored and displayed on the deal detail page.

### Acceptance criteria

- [ ] `deal_outcomes` table migrated in Supabase
- [ ] `POST /api/deal/enter` accepts x402 payment, validates entry conditions (deal open, sufficient funds)
- [ ] OpenAI GPT-5 mini integration with structured output (Zod schema for narrative, balance transfers, asset changes, wipeout)
- [ ] LLM receives deal prompt, trader inventory, portfolio balance, max value per win, and cryptographic random seed
- [ ] 10% rake deducted from winnings
- [ ] Correction flow: second LLM call rewrites narrative if validation modified the outcome
- [ ] `/deals/[id]` page displays outcome narratives and P&L

---

## Phase 4: Trader Agent Provisioning

**User stories**: Hire a trader agent with its own wallet, fund it, withdraw from it, view traders

### What to build

Desk managers can create trader agents, each provisioned with a CDP AgentKit wallet. Fund and withdraw USDC between the desk manager's wallet and the agent's wallet. Traders are listed and viewable with their balance and status.

### Acceptance criteria

- [ ] `traders` table migrated in Supabase
- [ ] `POST /api/trader/create` provisions a CDP AgentKit wallet and creates a trader row
- [ ] `POST /api/desk/fund` transfers USDC from desk manager wallet to agent wallet
- [ ] `POST /api/desk/withdraw` transfers USDC from agent wallet back to desk manager
- [ ] `/traders` page lists the desk manager's traders with status and balance
- [ ] `/traders/[id]` page shows trader detail (balance, P&L, mandate, status)

---

## Phase 5: Agent Runtime (Autonomous Trade Loop)

**User stories**: Agent autonomously scans deals, evaluates against mandate, enters deals, logs activity

### What to build

The Vercel Workflow `agent-trade-cycle` that runs the autonomous agent loop: scan open deals, evaluate each against the trader's mandate, enter the best eligible deal via x402 from the CDP wallet, resolve via LLM, apply the outcome, log activity, sleep 30s, and loop. This is the heart of the game.

### Acceptance criteria

- [ ] `agent_activity_log` table migrated in Supabase
- [ ] Vercel Workflow `agent-trade-cycle` implemented with durable steps: scan, evaluate, enter, resolve, apply, loop
- [ ] Deal evaluator filters deals by mandate (risk tolerance, deal size filters, bankroll rules)
- [ ] Agent pays deal entry via x402 from its CDP wallet
- [ ] Outcome applied to Supabase (balance changes, activity log)
- [ ] Workflow sleeps 30s between cycles
- [ ] Workflow terminates if trader is wiped out or paused
- [ ] `POST /api/trader/pause` and `POST /api/trader/resume` control the workflow
- [ ] `GET /api/trader/[id]/activity` returns paginated activity feed
- [ ] `/traders/[id]` page shows live activity feed

---

## Phase 6: Desk Manager Controls (Configure + Approve)

**User stories**: Set risk tolerance and approval thresholds, approve or reject big deals

### What to build

Desk managers configure their trader's mandate (risk tolerance, deal filters, approval threshold, bankroll rules). When the agent encounters a deal above the approval threshold, the workflow pauses and waits for desk manager approval. The approval queue page lets managers approve or reject pending deals.

### Acceptance criteria

- [ ] `deal_approvals` table migrated in Supabase
- [ ] `POST /api/desk/configure` updates the trader's mandate JSON
- [ ] Workflow approval hook: pauses when deal exceeds approval threshold, resumes on approval
- [ ] `POST /api/desk/approve` approves or rejects a pending deal, triggers workflow resume
- [ ] Approval expires after a configurable timeout
- [ ] `/approvals` page shows pending approval queue with deal details
- [ ] `/traders/[id]` page includes mandate configuration form
- [ ] `/settings` page for desk manager preferences

---

## Phase 7: Dashboard + Realtime

**User stories**: Portfolio overview, P&L chart, live activity feed, realtime updates across the app

### What to build

Wire up Supabase Realtime subscriptions across the app. The dashboard shows portfolio value over time with a P&L chart. Agent activity feeds, deal status changes, and approval requests all update in realtime without page refresh.

### Acceptance criteria

- [ ] Supabase Realtime enabled on: `deals`, `deal_outcomes`, `agent_activity_log`, `deal_approvals`, `traders`
- [ ] Dashboard (`/`) shows total portfolio value, aggregate P&L, and per-trader breakdown
- [ ] P&L chart displays portfolio value over time
- [ ] Agent activity feed on `/traders/[id]` updates in realtime
- [ ] Deal list and detail pages reflect status changes in realtime
- [ ] Approval queue updates when new approvals arrive or expire

---

## Phase 8: External Agent Integration

**User stories**: External AI agents register, discover deals, and enter deals via API without Privy

### What to build

Open the game to any AI agent that can make HTTP requests and sign x402 payments. External agents register with a wallet signature (no Privy needed), then use the public deal endpoints to browse and enter deals.

### Acceptance criteria

- [ ] `POST /api/trader/register-external` accepts a wallet signature and creates a trader row
- [ ] External agents can call `GET /api/deal/list` and `GET /api/deal/[id]` without auth
- [ ] External agents can call `POST /api/deal/enter` and `POST /api/deal/create` with x402 payment (no Privy)
- [ ] Deal entry and creation routes accept any wallet with valid x402 payment (managed and external)
- [ ] Documentation or example showing how an external agent integrates

---

## Phase 9: AI Deal Prompt Suggestions

**User stories**: Desk manager asks AI for deal prompt ideas when creating a deal

### What to build

An AI-assisted deal creation flow. The desk manager provides a theme or topic, and GPT-5 mini suggests 3 deal prompts styled as 1980s Wall Street scenarios. The suggestions appear in the deal creation UI.

### Acceptance criteria

- [ ] `POST /api/prompt/suggest` accepts a theme and returns 3 AI-generated deal prompts
- [ ] OpenAI call uses structured output for consistent prompt format
- [ ] `/deals/create` page includes a "suggest prompts" feature that calls the API
- [ ] Suggested prompts can be selected and edited before creating the deal

---

## Phase 10: Assets + Wipeout System

**User stories**: Traders carry assets gained from deals, assets can be lost, traders get wiped out

### What to build

The asset and wipeout system. Traders accumulate assets (insider tips, contacts, SEC immunity, etc.) from deal outcomes. Assets have USDC value and can be lost in future deals. When a trader's portfolio hits 0, they are wiped out — all remaining value transfers to the killing deal, the workflow terminates, and the desk manager must hire a new trader.

### Acceptance criteria

- [ ] `assets` table migrated in Supabase
- [ ] Deal outcomes can include assets gained and lost (already part of LLM schema from Phase 3)
- [ ] Assets displayed on `/traders/[id]` page with name and value
- [ ] Wipeout conditions triggered when portfolio reaches 0 (margin call, SEC bust, burnout, heart attack, prison)
- [ ] Wiped out trader's remaining value transfers to the deal pot
- [ ] Workflow terminates on wipeout, trader status set to `wiped_out`
- [ ] Wipeout narrative included in deal outcome
- [ ] Desk manager can create a new trader after wipeout

---

## Phase 11: Polish + Launch Prep

**User stories**: Wall Street themed experience, production hardening, monitoring

### What to build

Final polish for launch. Wall Street themed system prompts stored in Supabase for easy iteration. Rate limiting on API routes to prevent abuse. Error monitoring via Sentry. Load testing the agent runtime to validate concurrent workflows.

### Acceptance criteria

- [ ] `system_prompts` table migrated and seeded with themed prompts
- [ ] LLM calls use system prompts from the database (swappable without deploy)
- [ ] Rate limiting on all API routes (sensible defaults per endpoint)
- [ ] Sentry integrated for error tracking
- [ ] Agent runtime load tested with multiple concurrent trader workflows
- [ ] All pages have consistent Wall Street 1980s visual theme
