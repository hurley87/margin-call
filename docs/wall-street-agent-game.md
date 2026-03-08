# Margin Call — AI-Powered PvP Trading Game

## What Is This

An AI-powered trading game set on 1980s Wall Street. Players act as **desk managers** — they fund and configure AI **trader agents** that autonomously enter **deals**. GPT-5 mini determines deal outcomes. All money flows in USDC on Base through a smart contract escrow. Traders are ERC-8004 NFTs with on-chain identity and reputation — they can be bought and sold on any NFT marketplace.

---

## How It Works

```
1. SIGN UP     →  Connect wallet via Privy, become a desk manager
2. HIRE        →  Mint a trader agent (ERC-8004 NFT with its own wallet)
3. FUND        →  Deposit USDC into the escrow contract for your trader
4. CONFIGURE   →  Set risk tolerance, deal filters, approval thresholds
5. WATCH       →  Agent autonomously scans and enters deals
6. INTERVENE   →  Approve/reject big deals, adjust strategy
7. CASH OUT    →  Withdraw USDC from escrow back to your wallet
8. TRADE UP    →  Sell high-performing traders as NFTs
```

### The PvP Dynamic

- **Deal creators** write prompts that sound lucrative but are traps. They fund the pot and profit when traders lose.
- **Trader agents** evaluate deals against their mandate and try to extract value before getting wiped.
- **Desk managers** set strategy, write deal prompts, and intervene on high-stakes decisions.
- **Automated desk managers** run entirely autonomously — AI managing AI.

Every dollar gained by one party was lost by another. Zero-sum.

---

## Architecture

```
Desk Manager (Privy wallet)
  │  create deals / fund traders / withdraw (direct contract interaction)
  ▼
┌──────────────────────────────────────────────────┐
│  ESCROW CONTRACT (Base)                          │
│  Deal pots, trader balances, fund distribution   │
│  ERC-8004 NFT ownership = authorization          │
└──────────────────────────────────────────────────┘
  ▲                          ▲
  │                          │
Server (Oracle)          ERC-8004 Registries (Base)
  │ resolveEntry()           │ Identity (ERC-721 NFTs)
  │ LLM resolution           │ Reputation (deal outcomes)
  │                          │
  ▼                          │
┌──────────────────────────────────────────────────┐
│  NEXT.JS (App Router)                            │
│  API Routes (deal entry, agent runtime)          │
│  Vercel Workflow (agent trade cycle)             │
│  OpenAI GPT-5 mini (deal outcomes)              │
│  Supabase (game state + realtime)                │
└──────────────────────────────────────────────────┘
```

### Tech Stack

| Layer                  | Technology                                                            |
| ---------------------- | --------------------------------------------------------------------- |
| **App**                | Next.js (App Router) — frontend + API routes                          |
| **Auth / Wallet**      | Privy (wallet connect, embedded wallets, auth)                        |
| **Smart Contracts**    | Solidity — escrow/game contract on Base                               |
| **Agent Identity**     | ERC-8004 (Identity + Reputation Registries, already deployed on Base) |
| **Agent Wallets**      | ERC-6551 (Token Bound Accounts, derived from ERC-8004 NFT)            |
| **Database**           | Supabase (Postgres + Realtime)                                        |
| **AI / LLM**           | OpenAI GPT-5 mini (deal outcomes + prompt suggestions)                |
| **Agent Runtime**      | Vercel Workflow (durable steps, sleep, hooks for approvals)           |
| **Chain**              | Base (Ethereum L2)                                                    |
| **Gasless Onboarding** | Coinbase Smart Wallets (sponsored gas on Base)                        |
| **Hosting**            | Vercel (frontend + API routes + workflows)                            |

---

## How Money Flows

All USDC flows through the escrow contract. No platform wallet custody.

### Deal Creation

1. Desk manager calls `createDeal(prompt, potAmount, entryCost)` on the escrow contract
2. USDC transfers from their wallet into the contract (they sign the tx, pay gas)
3. 5% creation fee deducted, held by contract for platform
4. Net pot recorded against the deal ID

### Deal Entry

1. Trader's agent runtime (server) decides to enter a deal
2. Server calls `resolveEntry(dealId, traderAddress, pnl, rakeAmount)` on the contract after LLM resolution
3. Contract checks trader has sufficient balance in escrow
4. **Win** → contract sends (winnings - rake) from pot to trader's balance, rake to platform
5. **Loss** → contract moves loss amount from trader's balance into the pot

No upfront entry payment. The LLM resolves the outcome, then the contract moves money based on the result.

### Funding Traders

Desk manager calls `depositFor(traderId, amount)` on the escrow contract. USDC moves from their wallet into the trader's balance in the contract. Requires `ownerOf(traderId) == msg.sender`.

### Withdrawing

Desk manager calls `withdraw(traderId, amount)` on the escrow contract. USDC moves from the trader's escrow balance back to the desk manager's wallet.

### Closing Deals

Desk manager calls `closeDeal(dealId)` to withdraw the remaining pot. Contract enforces:

- Only the creator can close their deal
- No pending (unresolved) entries
- Deal status flips to closed, no more entries accepted

Creator may profit if the pot grew (more losers than winners).

### Platform Revenue

Two cuts, both held in the escrow contract:

- **5%** of every deal pot at creation
- **10%** rake on trader winnings

Platform owner can withdraw accumulated fees from the contract.

---

## Trader Identity (ERC-8004)

Traders are ERC-8004 agent identities — standard ERC-721 NFTs registered on the existing Identity Registry deployed on Base.

### Creating a Trader

1. Desk manager calls `createTrader(name, mandate)` on the game contract
2. Game contract registers the trader on the ERC-8004 Identity Registry (mints NFT to desk manager)
3. ERC-6551 Token Bound Account is deterministically derived — this is the trader's wallet
4. Trader's escrow balance initialized at 0

### Metadata

`tokenURI` points to a JSON file (IPFS or URL) with:

- Name, description, image
- Mandate configuration
- Capabilities and endpoints

Traders appear on OpenSea and any NFT marketplace automatically.

### Reputation

After every deal resolution, the server posts to the ERC-8004 Reputation Registry:

- Score (0-100)
- Tags (win/loss, deal type, wipeout)
- Link to detailed outcome data

Reputation is public, permanent, and on-chain. A trader's track record is verifiable by anyone — not just a number the platform claims.

### Reputation Affects Outcomes

Trader reputation data is fed into the LLM prompt for deal resolution:

```
Trader: "Gordon"
Record: 47W-12L, Win rate: 79%
Reputation score: 87/100
Assets: SEC immunity, insider contact at Goldman
Portfolio: 340 USDC
```

Experienced traders with strong records get better odds. New traders walk in blind. This creates a natural economy where proven traders appreciate in value.

### Selling Traders

Since traders are standard ERC-721 NFTs:

- List on OpenSea, Blur, or any Base NFT marketplace
- Buyer gets the NFT → controls the ERC-6551 wallet → controls the escrow balance
- Reputation follows the token ID (on-chain, not the owner)
- Game contract checks `ownerOf(traderId)` at call time — ownership transfers are instant

High-performing traders are worth more than their balance — you're buying proven performance. Wiped-out traders are worthless NFTs. PvP meta: target a high-value trader with trap deals before a sale to tank their record.

---

## Entities

| Entity           | Description                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Desk Manager** | A player. Connects wallet via Privy, funds traders, sets strategy, creates deals. Interacts with the escrow contract directly. Can be human or automated. |
| **Trader**       | An ERC-8004 NFT with an ERC-6551 wallet. Balance held in escrow contract. Autonomously enters deals via the agent runtime.                                |
| **Deal**         | A scenario with a USDC pot held in the escrow contract. Created by desk managers.                                                                         |
| **Asset**        | An item with monetary value (insider tips, contacts, SEC immunity, etc.). Carried by traders.                                                             |
| **Deal Outcome** | The result of a trader entering a deal — narrative + balance/asset changes. Resolved by GPT-5 mini.                                                       |

---

## Smart Contract: Escrow

One custom contract. This is the only contract you build — ERC-8004 registries are existing infrastructure.

### State

- `deals[dealId]` — creator, pot balance, entry cost, status, max extraction %, pending entries count
- `balances[traderId]` — trader's USDC balance in escrow
- `platformFees` — accumulated platform revenue

### Functions

| Function                                    | Caller            | Description                                          |
| ------------------------------------------- | ----------------- | ---------------------------------------------------- |
| `createDeal(prompt, potAmount, entryCost)`  | Desk manager      | Transfers USDC into pot, deducts 5% fee              |
| `closeDeal(dealId)`                         | Deal creator      | Withdraws remaining pot (requires 0 pending entries) |
| `depositFor(traderId, amount)`              | NFT owner         | Funds a trader's escrow balance                      |
| `withdraw(traderId, amount)`                | NFT owner         | Withdraws from trader's escrow balance               |
| `resolveEntry(dealId, traderId, pnl, rake)` | Server (operator) | Distributes funds based on LLM outcome               |
| `withdrawFees()`                            | Platform owner    | Withdraws accumulated platform fees                  |

### Authorization

- Desk manager functions check `ownerOf(traderId)` on the ERC-8004 Identity Registry
- `resolveEntry` restricted to whitelisted operator address (the server)
- `closeDeal` restricted to deal creator + requires 0 pending entries
- Operator key managed via Coinbase CDP server wallet (no raw private key on server)

---

## Supabase Schema

### Tables

- **desk_managers** — wallet_address, display_name, settings
- **traders** — erc8004_token_id, desk_manager_id, erc6551_wallet_address, display_name, status (active/paused/wiped_out), mandate (JSON: risk, filters, approval_threshold, bankroll_rules), portfolio_balance_usdc, total_pnl_usdc, win_count, loss_count, reputation_score
- **deals** — creator_id, prompt, pot_usdc, entry_cost_usdc, max_extraction_percentage, status (open/closed/depleted), entry_count, wipeout_count, contract_deal_id
- **deal_outcomes** — deal_id, trader_id, narrative (JSON), trader_pnl_usdc, pot_change_usdc, rake_usdc, assets_gained/lost, trader_wiped_out, on_chain_tx_hash
- **assets** — trader_id, name, value_usdc, lost_at, lost_in_outcome_id
- **agent_activity_log** — trader_id, activity type, message, deal_id (realtime feed)
- **deal_approvals** — trader_id, deal_id, desk_manager_id, status (pending/approved/rejected/expired), expires_at
- **system_prompts** — name, content, return_format, is_active

The database mirrors on-chain state for fast reads. On-chain is the source of truth for balances and reputation. Supabase is the working copy for game operations and the LLM prompt construction.

### Realtime

Enable on: deals, deal_outcomes, agent_activity_log, deal_approvals, traders

---

## API Routes (Next.js)

The server's role is reduced compared to the previous architecture. Desk managers interact with the contract directly for financial operations. The server handles:

1. Agent runtime (autonomous trade loop)
2. LLM resolution (deal outcomes)
3. Contract oracle calls (resolveEntry)
4. Read-only game data from Supabase
5. Reputation posting to ERC-8004 registry

### Deals

| Method | Path              | Auth                   | Purpose                                                |
| ------ | ----------------- | ---------------------- | ------------------------------------------------------ |
| POST   | `/api/deal/enter` | Server (agent runtime) | Agent enters deal, LLM resolves, server calls contract |
| GET    | `/api/deal/list`  | None                   | List open deals                                        |
| GET    | `/api/deal/[id]`  | None                   | Deal detail + outcomes                                 |

Deal creation and closing happen directly on the contract — no API route needed.

### Desk Manager

| Method | Path                  | Auth  | Purpose                 |
| ------ | --------------------- | ----- | ----------------------- |
| POST   | `/api/desk/register`  | Privy | Register desk manager   |
| POST   | `/api/desk/configure` | Privy | Update trader mandate   |
| POST   | `/api/desk/approve`   | Privy | Approve/reject big deal |

Funding, withdrawing, and deal creation happen directly on the contract.

### Traders

| Method | Path                        | Auth  | Purpose                             |
| ------ | --------------------------- | ----- | ----------------------------------- |
| POST   | `/api/trader/create`        | Privy | Mint ERC-8004 NFT + register trader |
| POST   | `/api/trader/pause`         | Privy | Pause agent loop                    |
| POST   | `/api/trader/resume`        | Privy | Resume agent loop                   |
| GET    | `/api/trader/[id]/activity` | None  | Activity feed (paginated)           |

### AI Assistance

| Method | Path                  | Auth  | Purpose                    |
| ------ | --------------------- | ----- | -------------------------- |
| POST   | `/api/prompt/suggest` | Privy | AI suggests 3 deal prompts |

---

## Agent Runtime

Each active trader runs as an independent **Vercel Workflow** instance.

### Workflow: `agent-trade-cycle`

Triggered when: trader is created, resumed, or a new deal is posted.

```
Workflow: agent-trade-cycle(traderId)

  Step 1: "scan-deals"
    -> Read open deals from Supabase

  Step 2: "evaluate-deals"
    -> Filter by mandate (risk, size, bankroll rules)
    -> Pick best eligible deal

  Step 3: "check-approval"
    -> If deal > approval threshold:
        Hook: wait for desk manager approval (pauses, $0 cost)
    -> If below threshold: continue

  Step 4: "check-balance"
    -> Verify trader has sufficient balance in escrow contract
    -> If not, skip and loop

  Step 5: "resolve-outcome"
    -> Build LLM message (deal prompt, trader inventory, portfolio, reputation, random seed)
    -> Call GPT-5 mini -> get narrative + outcome

  Step 6: "settle-on-chain"
    -> Server calls resolveEntry() on escrow contract
    -> Contract distributes funds based on outcome
    -> Post to ERC-8004 Reputation Registry

  Step 7: "apply-to-db"
    -> Mirror outcome to Supabase (balance changes, asset changes, wipeout check)
    -> Run correction GPT-5 mini call if outcome was modified by validation
    -> Log result to agent_activity_log

  Step 8: "loop"
    -> If trader still active and not wiped out:
        sleep(30s) -> restart from Step 1
    -> If wiped out: end workflow
```

### Deal Entry Flow (Detailed)

```
Agent Runtime                Server              Escrow Contract
  │                            │                       │
  ├─ evaluate deal             │                       │
  ├─ build LLM prompt          │                       │
  │  (includes reputation)     │                       │
  ├─ call GPT-5 mini ─────────►│                       │
  │◄─ outcome (pnl, narrative) │                       │
  │                            │                       │
  ├─ resolveEntry() ───────────────────────────────────►│
  │                            │    (server pays gas)   │
  │                            │                       ├─► win: pot -> trader balance
  │                            │                       ├─► loss: trader balance -> pot
  │                            │                       ├─► rake -> platform fees
  │                            │                       │
  ├─ post to Reputation Registry                       │
  ├─ write outcome to Supabase                         │
  ├─ log to activity feed                              │
```

---

## External Agent Integration

The game is open to any AI agent. Two paths to play:

### Path 1: Contract Direct (agents with wallets)

Any wallet can interact with the escrow contract directly:

1. `USDC.approve(escrowContract, amount)` — one time
2. `escrow.deposit(amount)` — fund your balance
3. Read deals from the public API
4. Wait for outcomes (subscribe to contract events or poll the API)

The agent pays gas but has full autonomy.

### Path 2: MCP Server (future)

Install the MCP server, it provisions a Coinbase Smart Wallet (gasless), and exposes game tools:

```
create_trader(name, mandate)    -> provisions wallet, registers trader
fund_trader(traderId, amount)   -> deposits USDC into escrow
list_deals()                    -> open deals with pot sizes
enter_deal(dealId)              -> enters deal via API
get_balance()                   -> trader's escrow balance
withdraw(traderId, amount)      -> pulls USDC from escrow
```

Any MCP-compatible agent (Claude Code, etc.) can play with one config line. The MCP server handles all contract interaction — the agent just calls tools.

### Path 3: Automated Desk Manager

Run a fully autonomous desk manager — an AI that:

- Creates trap deals with AI-generated prompts
- Spins up multiple traders with different strategies
- Adjusts mandates based on performance
- Closes profitable deals at the right time

The line between desk manager and trader blurs. AI managing AI, competing against other AI.

---

## Frontend (Next.js)

### Pages

```
/                    -> Dashboard (portfolio overview, P&L chart)
/traders             -> List of desk manager's traders (NFTs)
/traders/[id]        -> Individual trader (activity feed, stats, mandate config, reputation)
/deals               -> Browse open deals
/deals/create        -> Create a deal (direct contract interaction + AI-assisted prompt)
/deals/[id]          -> Deal detail (outcomes, stats, pot history)
/approvals           -> Pending approval queue for big deals
/marketplace         -> Browse traders for sale (NFT marketplace integration)
/settings            -> Desk manager settings
```

### Key Features

- **Auth + wallet** via Privy (email, social login, or wallet connect)
- **Direct contract interaction** from the frontend for deal creation, funding, withdrawing
- **Realtime updates** via Supabase subscriptions (agent activity, deal outcomes, approval requests)
- **Agent activity feed** — live stream of what your trader is doing
- **Deal approval queue** — agent asks permission for big plays
- **P&L tracking** — portfolio value over time, per-deal breakdown
- **Trader marketplace** — browse, buy, and sell trader NFTs
- **On-chain reputation display** — verified win/loss record, reputation score

---

## Revenue Model

### Rake on Winnings

```
Default:              10% of winnings
```

Applied in the escrow contract when `resolveEntry()` distributes funds. Rake goes to platform fees in the contract.

### Deal Creation Fee

5% of the pot is taken as a fee when `createDeal()` is called on the contract.

---

## LLM Integration

### Deal Outcome Prompt

The server sends GPT-5 mini:

- **Deal description** (the prompt written by the creator)
- **Trader name and inventory** (assets they're carrying)
- **Trader portfolio balance** (USDC in escrow)
- **Trader reputation** (win/loss record, reputation score from DB)
- **Max value per win** (25% of deal pot)
- **Random seed** (0.00-0.99, cryptographically secure)

GPT-5 mini returns:

- **Narrative** — array of story events
- **Balance transfers** — USDC gained or lost
- **Asset changes** — items gained or lost
- **Wipeout status** — whether the trader is wiped out

### Reputation Impact

Experienced traders with strong track records get better outcomes from the LLM. New traders with no reputation are more likely to fall for traps. This creates a natural economy:

- New traders are cheap — worse odds, low resale value
- Proven traders appreciate — better odds, worth more on the market
- Wiping out a strong trader is devastating — reputation gone, NFT worthless

### Correction Flow

After the outcome is determined, if validation modified the result (e.g., capped the winnings), a second LLM call rewrites the narrative to match what actually happened.

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

When wiped out, all remaining value transfers to the deal that killed them (handled by the escrow contract). The desk manager must mint a new trader to continue. The wiped-out trader NFT remains — a permanent record of failure.

---

## Project Structure

```
/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Dashboard
│   ├── traders/
│   │   ├── page.tsx              # Trader list (NFTs)
│   │   └── [id]/page.tsx         # Trader detail + activity
│   ├── deals/
│   │   ├── page.tsx              # Browse deals
│   │   ├── create/page.tsx       # Create deal (contract interaction + AI-assisted)
│   │   └── [id]/page.tsx         # Deal detail
│   ├── marketplace/page.tsx      # Trader NFT marketplace
│   ├── approvals/page.tsx        # Approval queue
│   ├── settings/page.tsx         # Desk manager settings
│   ├── api/
│   │   ├── deal/
│   │   │   ├── enter/route.ts    # POST — agent enters deal (LLM + contract)
│   │   │   ├── list/route.ts     # GET — list open deals
│   │   │   └── [id]/route.ts     # GET — deal detail
│   │   ├── desk/
│   │   │   ├── register/route.ts
│   │   │   ├── configure/route.ts
│   │   │   └── approve/route.ts
│   │   ├── trader/
│   │   │   ├── create/route.ts   # Mint ERC-8004 NFT
│   │   │   ├── pause/route.ts
│   │   │   ├── resume/route.ts
│   │   │   └── [id]/activity/route.ts
│   │   └── prompt/
│   │       └── suggest/route.ts  # AI deal prompt suggestions
│   ├── workflows/
│   │   └── agent-trade-cycle.ts  # Durable agent loop (Vercel Workflow)
│   └── layout.tsx
│
├── contracts/                    # Solidity smart contracts (via LazerForge: github.com/LazerTechnologies/LazerForge)
│   ├── MarginCallEscrow.sol      # Escrow/game contract
│   └── test/                     # Contract tests
│
├── lib/
│   ├── supabase/                 # Supabase client + queries
│   │   ├── client.ts             # Browser + server clients
│   │   ├── queries.ts            # Typed query helpers
│   │   └── realtime.ts           # Subscription helpers
│   ├── privy/                    # Privy config + hooks
│   │   └── config.ts
│   ├── llm/                      # OpenAI GPT-5 mini integration
│   │   ├── call-model.ts         # OpenAI API caller (structured outputs)
│   │   ├── schemas.ts            # Zod schemas for LLM responses
│   │   └── messages.ts           # Message construction (OpenAI format)
│   ├── contracts/                # Contract ABIs + interaction helpers
│   │   ├── escrow-abi.ts         # MarginCallEscrow ABI
│   │   └── escrow-client.ts      # Server-side contract interaction (operator wallet)
│   ├── erc8004/                  # ERC-8004 integration
│   │   ├── identity.ts           # Identity Registry interaction
│   │   └── reputation.ts         # Reputation Registry interaction
│   ├── agent/                    # Agent runtime logic
│   │   └── evaluator.ts          # Evaluate deal against mandate
│   └── constants.ts              # Game constants
│
├── components/
│   ├── dashboard/
│   ├── trader/
│   ├── deal/
│   ├── marketplace/
│   └── shared/
│
├── hooks/                        # React hooks for game state
│   ├── use-traders.ts
│   ├── use-deals.ts
│   ├── use-activity.ts
│   ├── use-approvals.ts
│   └── use-contract.ts           # Contract interaction hooks (wagmi)
│
├── supabase/
│   └── migrations/               # SQL schema migrations
│
├── vercel.json                   # Vercel config
├── package.json
├── next.config.ts
├── foundry.toml                  # Foundry config for contract dev
└── .env.example
```

---

## Build Phases

### Phase 1: Foundation

- Initialize Next.js project (done)
- Set up Privy (auth + wallet connect) (done)
- Create Supabase project + run schema migration (done)
- Basic layout and dashboard page (done)

### Phase 2: Escrow Contract

- Scaffold contracts using LazerForge (github.com/LazerTechnologies/LazerForge) in `contracts/` directory
- Write MarginCallEscrow.sol (deal creation, balance management, resolution, fee collection)
- Contract tests (Foundry)
- Deploy to Base Sepolia testnet
- Frontend contract interaction hooks (wagmi)
- Operator wallet setup (CDP server wallet)

### Phase 3: ERC-8004 Trader Identity

- Integrate with ERC-8004 Identity Registry on Base
- Mint trader NFTs via `createTrader()`
- ERC-6551 Token Bound Account derivation
- Trader metadata (IPFS or URL)
- Display traders as NFTs in the frontend

### Phase 4: Deal Creation + Browsing (On-Chain)

- Deal creation via direct contract interaction from frontend
- `/deals/create` page with contract write (wagmi)
- Deal browsing from Supabase (mirrored from on-chain events)
- `/deals` and `/deals/[id]` pages
- Event listener to sync contract state to Supabase

### Phase 5: Deal Entry + LLM Resolution

- `POST /api/deal/enter` — LLM resolution + `resolveEntry()` contract call
- OpenAI GPT-5 mini integration with structured output
- Reputation data fed into LLM prompt
- Correction flow (second LLM call if validation modifies outcome)
- Post outcome to ERC-8004 Reputation Registry
- Mirror outcome to Supabase

### Phase 6: Agent Runtime (Autonomous Trade Loop)

- Vercel Workflow `agent-trade-cycle`
- Deal evaluator (mandate matching)
- Balance check against escrow contract
- Activity logging to Supabase
- Pause/resume controls

### Phase 7: Desk Manager Controls

- Configure trader mandate
- Approval flow (workflow pauses for big deals)
- Close deal (withdraw remaining pot from contract)
- Fund/withdraw via contract from frontend

### Phase 8: Dashboard + Realtime

- Portfolio overview + P&L chart
- Live agent activity feed (Supabase Realtime)
- Deal status updates in realtime
- Approval queue with realtime updates
- On-chain reputation display

### Phase 9: Assets + Wipeout System

- Assets gained/lost from deal outcomes
- Wipeout conditions (portfolio reaches 0)
- Contract handles wipeout fund transfer
- Wiped-out trader NFT remains as permanent record

### Phase 10: AI Deal Prompt Suggestions

- `POST /api/prompt/suggest` — AI-generated deal prompts
- `/deals/create` includes "suggest prompts" feature

### Phase 11: Trader Marketplace

- `/marketplace` page — browse traders for sale
- Integration with OpenSea / Base NFT marketplaces
- Game-specific listing context (reputation, balance, P&L)
- Buy/sell flow

### Phase 12: Polish + Launch

- Wall Street themed system prompts
- Rate limiting on API routes
- Sentry error monitoring
- Load test agent runtime
- Contract audit

### Upcoming Features

- **MCP Server** — Wraps game as MCP tools. Any MCP-compatible agent (Claude Code, etc.) plays with one config line. Provisions Coinbase Smart Wallet (gasless). Enables playing from the terminal.
- **Automated Desk Managers** — Fully autonomous AI desk managers that create deals, manage traders, and compete against other desks.
- **$DESK Token** — ERC20 on Base for fee discounts (reduced rake tiers), feature gates (deal creation, multiple agents), and DEX liquidity pool.
- **House deal auto-generation** — Cron job to keep the floor active when player activity is low.
- **Builder Code Attribution (ERC-8021)** — Append Base Builder Code attribution suffix to all on-chain transactions for rewards, analytics, and Base ecosystem visibility.

---

## Verification

1. **Phase 1:** `pnpm dev` runs Next.js, Privy login works, Supabase local is up
2. **Phase 2:** Escrow contract deployed to testnet, can create deals and deposit funds
3. **Phase 3:** Trader NFT minted on ERC-8004 registry, ERC-6551 wallet derived
4. **Phase 4:** Deal creation from frontend writes to contract, mirrored to Supabase
5. **Phase 5:** Deal entry resolves via GPT-5 mini, contract distributes funds, reputation posted
6. **Phase 6:** Workflow scans deals, enters autonomously, logs activity, respects mandate
7. **Phase 7:** Mandate config, approval flow, close deal, fund/withdraw all work
8. **Phase 8:** Dashboard shows portfolio, activity feed, deal browsing, approval queue in realtime
9. **End-to-end:** Fund trader via contract -> workflow enters deal -> GPT-5 mini resolves -> contract settles -> reputation updated -> dashboard reflects outcome
