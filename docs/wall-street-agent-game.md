![Margin Call](../public/banner.png)

# Margin Call — AI-Powered PvP Trading Game

## What Is This

An AI-powered trading game set on 1980s Wall Street. Players act as **desk managers** — they fund and configure AI **trader agents** that autonomously enter **deals**. Deal odds are computed mechanically (market mood + SEC heat) and `gpt-4o-mini` narrates each outcome; the market Wire uses `gpt-5-mini`. All money flows in USDC on Base through a smart contract escrow. Traders use ERC-8004 NFTs for persistent identity and reputation; a supported marketplace remains future work.

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
8. BUILD RECORD →  Grow a trader's public history or replace a failed one
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
Desk Manager (Privy wallet / Base Account)
  ├─ USDC ─────► ESCROW (pots, bankroll, settlement)
  └─ $BLOW ────► SEATVAULT (per-trader capacity principal)

Convex agent runtime
  ├─ reads SeatVault tierOf() for capacity
  ├─ decides outcome mechanically
  ├─ asks gpt-4o-mini to narrate the fixed result
  └─ settles verified PnL through the escrow

ERC-8004 Registries (Base)
  └─ trader identity NFT + public reputation history

┌──────────────────────────────────────────────────┐
│  NEXT.JS (App Router)                            │
│  HTTP boundary (/api/deal/enter, /api/mcp/*)     │
│  CONVEX BACKEND                                  │
│  Crons + scheduler (agent trade cycle)           │
│  gpt-4o-mini (outcomes) / gpt-5-mini (Wire)      │
│  Convex (game state + reactivity)                │
└──────────────────────────────────────────────────┘
```

### Tech Stack

| Layer                  | Technology                                                              |
| ---------------------- | ----------------------------------------------------------------------- |
| **App**                | Next.js (App Router) — frontend + API routes                            |
| **Auth / Wallet**      | Privy (wallet connect, embedded wallets, auth)                          |
| **Smart Contracts**    | Solidity — USDC escrow + separate `$BLOW` SeatVault on Base Sepolia     |
| **Agent Identity**     | ERC-8004 (Identity + Reputation Registries, already deployed on Base)   |
| **Agent Wallets**      | ERC-6551 (Token Bound Accounts, derived from ERC-8004 NFT)              |
| **Database**           | Convex (reactive database + scheduler/crons)                            |
| **AI / LLM**           | `gpt-4o-mini` (deal selection + outcome narration), `gpt-5-mini` (Wire) |
| **Agent Runtime**      | Convex crons + scheduler (1-min heartbeat → per-trader cycle)           |
| **Chain**              | Base (Ethereum L2)                                                      |
| **Gasless Onboarding** | Privy sponsored transactions on Base Sepolia                            |
| **Hosting**            | Vercel (Next.js HTTP layer) + Convex (backend)                          |

---

## How Money Flows

All USDC flows through the escrow contract. No platform wallet custody.

### Deal Creation

1. Desk manager calls `createDeal(prompt, potAmount, entryCost)` on the escrow contract
2. USDC transfers from their wallet into the contract (they sign the tx, pay gas)
3. 5% creation fee deducted, held by contract for platform
4. Net pot recorded against the deal ID

### Deal Entry

**Desk adversarial rule:** Traders cannot enter deals created by their own desk. Deals are intended to be public market opportunities and traps for **rival** desks—house or system-created deals remain open to everyone. Same-desk entry is blocked in deal selection and at verified entry (`recordVerifiedEntry`).

1. Trader's agent runtime (server) decides to enter a deal
2. Code decides win/loss and magnitude mechanically, then `gpt-4o-mini` narrates the fixed result
3. Server calls `resolveEntry(dealId, traderAddress, pnl, rakeAmount)` on the contract
4. Contract checks trader has sufficient balance in escrow
5. **Win** → contract sends (winnings - rake) from pot to trader's balance, rake to platform
6. **Loss** → contract moves loss amount from trader's balance into the pot

No upfront entry payment. Win/loss starts from a 50% baseline shifted by market mood and SEC heat. Magnitudes are sized from entry cost, with average losses heavier than average wins. The model cannot choose or alter the financial result.

### Funding Traders

Desk manager calls `depositFor(traderId, amount)` on the escrow contract. USDC moves from their wallet into the trader's balance and the escrow records that wallet as the trader's depositor.

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

## `$BLOW` Floor Capacity

`$BLOW` is Base Sepolia capacity principal, not settlement money.

| Tier          | Active `$BLOW` | Cycle interval | Max unresolved entries |
| ------------- | -------------: | -------------: | ---------------------: |
| Gallery       |              0 |     10 minutes |                      1 |
| Seat          |         10,000 |      5 minutes |                      1 |
| Corner Office |         50,000 |      5 minutes |                      2 |

**Stake affects capacity, never outcome probability.** The active SeatVault never touches USDC and staking state is excluded from selection, probability, payout, rake, and deal creation. Only the current escrow depositor can add principal. Initiated withdrawals stop granting capacity immediately and return to the original staker after a 24-hour cooldown.

The active on-chain `tierOf(traderId)` read is authoritative; failures fail closed to Gallery. See [`docs/trader-fuel-token.md`](./trader-fuel-token.md) for the complete shipped design and testnet addresses.

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

The identity uses NFT standards, but the application does not currently ship a marketplace or supported ownership-transfer flow.

### Reputation

After every deal resolution, Convex records the outcome and the current UI derives:

- Score: `max(0, wins * 3 - losses - wipeouts * 5)`
- Wins, losses, win rate, and wipeout count
- Total recorded P&L

The ERC-8004 trader identity is on-chain. The displayed performance record is currently a Convex-backed game read model; outcomes are not written to the ERC-8004 Reputation Registry today.

### Reputation

The public profile derives performance context from Convex outcomes:

```
Trader: "Gordon"
Record: 47W-12L, Win rate: 79%
Reputation score: 87/100
Assets: SEC immunity, insider contact at Goldman
Portfolio: 340 USDC
```

The record helps desks evaluate traders and counterparties, but it is not passed into the mechanical win roll. Win probability is computed from market conditions (world mood + SEC heat) in `convex/agent/outcomeResolver.ts`; reputation is displayed from game history and is not an input to odds, payout, or rake.

### Marketplace Direction (Future)

Trader identities use ERC-721-compatible standards, but a protocol-level transfer is not currently treated as transferring a playable trader. Game control also depends on application ownership, escrow depositor authority, and wallet bindings.

Future marketplace work must define how application control, escrow deposits, mandates, assets, approvals, and `$BLOW` principal migrate. Until then, identity and reputation are persistent but buy/sell gameplay is not available.

---

## Entities

| Entity           | Description                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Desk Manager** | A player. Connects wallet via Privy, funds traders, sets strategy, creates deals. Interacts with the escrow contract directly. Can be human or automated. |
| **Trader**       | An ERC-8004 NFT with an ERC-6551 wallet. Balance held in escrow contract. Autonomously enters deals via the agent runtime.                                |
| **Deal**         | A scenario with a USDC pot held in the escrow contract. Created by desk managers.                                                                         |
| **Asset**        | An item with monetary value (insider tips, contacts, SEC immunity, etc.). Carried by traders.                                                             |
| **Deal Outcome** | The result of a trader entering a deal — narrative + balance/asset changes. Odds computed mechanically; `gpt-4o-mini` narrates the pre-decided result.    |

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

## Convex Schema

The full schema lives in `convex/schema.ts`. Core tables:

- **deskManagers** — desk identity + bound wallet address, settings
- **traders** — ERC-8004 tokenId, deskManager link, CDP/ERC-6551 wallet + walletStatus, status (active/paused/wiped_out), mandate + personality (JSON), escrowBalanceUsdc, P&L, win/loss counts, cycle lease/generation fields, lastCycleAt
- **deals** — creator (deskManagerId or address) + creatorType, prompt, potUsdc, entryCostUsdc, status (open/closed/depleted), onChainDealId
- **dealEntries** — verified on-chain entries (idempotent by paymentId/correlation)
- **dealOutcomes** — deal/trader link, narrative (JSON), P&L, pot change, rake, assets gained/lost, wipeout flag, txHash
- **dealApprovals** — high-stakes approvals from MCP agents, status (pending/approved/rejected/expired/consumed), 24h TTL
- **agentActivityLog** — structured per-trader activity records
- **marketNarratives**, **narrativeSeasons**, **narrativeArcs**, **narrativeEntities** — Wire narrative engine state
- **mcpApiKeys** — per-desk MCP Bearer token hashes
- **mcpIntents** — pending on-chain treasury intents (prepare → Base MCP → confirm flow)

Convex is the sole source of truth for working game state and LLM prompt construction. The `MarginCallEscrow` contract on Base is the source of truth for balances and reputation; on divergence, the contract wins.

### Reactivity

Convex queries are reactive by default — UI subscribes via `convex/react` hooks (`useQuery`), no manual subscription setup or cache invalidation. (Supabase Realtime is no longer used.)

---

## HTTP Routes (Next.js) + Convex Functions

Game CRUD (create/list/configure traders, deals, approvals, activity, leaderboard) lives in **Convex functions** called via `convex/react` hooks — not REST routes. The Next.js HTTP layer is a thin boundary for the few operations that need to run off-Convex: on-chain entry, MCP, and auth handshakes.

### Next.js HTTP routes

| Method   | Path                               | Auth    | Purpose                                                          |
| -------- | ---------------------------------- | ------- | ---------------------------------------------------------------- |
| POST     | `/api/deal/enter`                  | SIWA    | Operator-signed on-chain `enterDeal` (called by the agent cycle) |
| GET/POST | `/api/mcp/*`                       | MCP key | MCP reads + treasury prepare/confirm (see `packages/mcp-server`) |
| POST     | `/api/mcp/keys`, `/keys/challenge` | SIWE    | Per-desk MCP key issuance (SIWE handshake)                       |
| GET      | `/api/mcp/plugin`                  | None    | Base MCP plugin markdown                                         |
| GET/POST | `/api/siwa/*`                      | —       | Sign-In-With-Account nonce + handshake                           |

### Convex functions (representative)

- Traders: `traders.create`, `traders.setStatus`, `traders.configure`, queries for roster/detail
- Deals: `deals.recordOnChainCreation`, `deals.recordVerifiedEntry`, open-deal queries
- Outcomes/activity: `dealOutcomes.*`, `agentActivityLog.append`, `leaderboard.*`
- Approvals: `dealApprovals.*`
- Agent loop: `internal.agent.scheduler.scheduler`, `internal.agent.cycle.cycle`

Deal creation/closing and funding/withdrawing go on-chain via the escrow contract (desk treasury uses the MCP prepare/confirm flow); only the **verified** result is recorded in Convex.

---

## Agent Runtime

The agent loop runs entirely on **Convex crons + scheduler** (`convex/crons.ts`, `convex/agent/`). There is no Vercel Workflow.

### Scheduler heartbeat → per-trader cycle

A 1-minute cron (`agent-scheduler`) is just a heartbeat. Each trader becomes eligible on its own interval (`resolveCycleIntervalMsForTrader` / `listStaleTradersForCycle`), not once per tick. The whole loop is gated to NYSE hours (Mon–Fri 09:30–16:00 ET).

```
cron "agent-scheduler" (every 1 min)
  -> internal.agent.scheduler.scheduler
       -> if market closed: exit early
       -> query stale active, wallet-ready, funded, lease-free traders
       -> for up to 5 stale traders:
            ctx.scheduler.runAfter(0, internal.agent.cycle.cycle, { traderId })

internal.agent.cycle.cycle(traderId)   [lease-guarded, generation-checked]

  1. Load trader + mandate; take cycle lease
  2. Select deal — selectDeal(): mandate filter -> desk dedup ->
     gpt-4o-mini rank (ratio fallback); excludes own-desk + resolved deals
  3. Check approval — if high-stakes, create/await a dealApproval row (no on-chain action)
  4. Enter on-chain — POST /api/deal/enter (SIWA): operator signs escrow.enterDeal(dealId, tokenId)
  5. Resolve outcome — win/loss decided mechanically (market mood + SEC heat,
     base 0.5 ± ~0.15); magnitude randomized; gpt-4o-mini narrates the result
  6. Finalize — apply PnL to escrow balance, derive wipeout mechanically,
     write dealOutcomes + agentActivityLog (all Convex mutations)
```

### Deal Entry Flow (Detailed)

```
Convex agent.cycle        /api/deal/enter (operator)   Escrow Contract
  │                            │                            │
  ├─ select deal              │                            │
  ├─ check approval           │                            │
  ├─ POST enter ─────────────►│                            │
  │                            ├─ operator signs ──────────►│ enterDeal(dealId, tokenId)
  │◄─ entry confirmed (txHash) │                            │
  │                            │                            │
  ├─ resolve outcome (mechanical odds + gpt-4o-mini narrate)│
  ├─ apply PnL to escrow balance ─────────────────────────►│
  ├─ write dealOutcomes (Convex)                            │
  ├─ append agentActivityLog (Convex)                       │
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

### Path 2: MCP Server (shipped)

Connect Base MCP, issue a per-desk key by signing a SIWE challenge, and use either the Base MCP plugin or standalone server. The signing Base Account is automatically bound as the non-custodial desk treasury.

```
create_trader(name, mandate)          -> mints a trader identity
list_deals()                          -> open deals with eligibility context
fund_trader(traderId, amount)         -> prepares a treasury transaction
create_deal(dispatchId, parameters)   -> prepares a Wire-sourced deal
confirm_intent(intentId, txHash)      -> verifies the Base Account transaction
answer_approval(approvalId, decision) -> approves or rejects a high-stakes entry
```

Treasury operations use prepare → Base MCP `send_calls` → confirm. The agent never receives the Base Account private key. Autonomous traders, not the desk agent, choose individual deal entries.

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
/                    -> Landing, onboarding, and authenticated trading desk
/traders/[traderId]  -> Public/owned trader detail and floor-seat controls
/admin/wire          -> Operator-only Wire controls
```

### Key Features

- **Auth + wallet** via Privy (email, social login, or wallet connect)
- **Direct contract interaction** from the frontend for deal creation, funding, withdrawing
- **Realtime updates** via Convex reactive queries (agent activity, deal outcomes, approval requests)
- **Agent activity feed** — live stream of what your trader is doing
- **Deal approval queue** — agent asks permission for big plays
- **P&L tracking** — portfolio value over time, per-deal breakdown
- **Future marketplace direction** — not part of the current application
- **Public reputation display** — Convex-backed win/loss record, score, win rate, wipeouts, and P&L

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

The win/loss decision and magnitude are computed **mechanically** in `convex/agent/outcomeResolver.ts` (market mood + SEC heat shift a base ~0.5 win probability; magnitude randomized). The LLM's job is narration, not adjudication. The narration call (`gpt-4o-mini`) receives:

- **Deal description** (the prompt written by the creator)
- **Trader name and inventory** (assets they're carrying)
- **Trader portfolio balance** (USDC in escrow)
- **Trader reputation** (win/loss record, reputation score)
- **Max value per win** (25% of deal pot)
- **The pre-decided outcome** (win/loss + PnL it must narrate)

`gpt-4o-mini` returns:

- **Narrative** — array of story events consistent with the pre-decided outcome
- **Asset changes** — items gained or lost

Balance transfers and wipeout status are applied mechanically from the validated PnL — the LLM cannot set them.

### Reputation Impact

Reputation makes a trader's history legible without granting a mechanical advantage:

- New traders have little evidence behind them
- Proven traders carry a visible record the market can evaluate
- Wiping out a strong trader is devastating — reputation gone, NFT worthless

Odds are computed mechanically from market conditions (world mood + SEC heat), not from reputation. Reputation is tracked and displayed but is not an input to win probability, payouts, or rake.

### Narrative Consistency

Code decides and clamps the financial result before it is persisted. The model is instructed to narrate that decided result and cannot set P&L or wipeout status.

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

1. **Margin Call** — validated losses reduce the bankroll to zero
2. **SEC Bust** — caught by regulators
3. **Burnout** — too many bad deals
4. **Heart Attack** — extreme stress (rare)
5. **Prison** — insider trading conviction

For normal deals, the entry amount is the trader's maximum downside. The full escrow balance is used for affordability and bankroll accounting, but it is not collateral for every deal. Wipeout is derived mechanically after the validated PnL is applied; the LLM cannot directly wipe out a trader by setting a flag. Full-portfolio wipeout deals must be explicit deal types with clear UI warnings.

The desk manager must mint a new trader to continue. The wiped-out trader NFT remains — a permanent record of failure.

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
│   ├── approvals/page.tsx        # Approval queue
│   ├── settings/page.tsx         # Desk manager settings
│   ├── api/                      # Thin HTTP boundary (game CRUD is in convex/)
│   │   ├── deal/enter/route.ts   # POST — operator-signed on-chain entry (SIWA)
│   │   ├── mcp/                  # MCP reads + treasury prepare/confirm, keys, plugin
│   │   └── siwa/                 # Sign-In-With-Account nonce + handshake
│   └── layout.tsx
│
├── convex/                       # Backend source of truth (Convex)
│   ├── schema.ts                 # All game tables
│   ├── crons.ts                  # agent-scheduler, wire generator, TTL sweeps
│   ├── agent/                    # scheduler.ts, cycle.ts, dealSelection.ts, outcomeResolver.ts
│   ├── wire/                     # Narrative engine (generator.ts uses gpt-5-mini)
│   ├── mcp/                      # MCP server-side handlers (intents, approvals, keys)
│   ├── lib/                      # Shared helpers (e.g. tradingHours.ts)
│   ├── wallet.ts                 # CDP smart-account creation
│   ├── traders.ts deals.ts dealOutcomes.ts dealApprovals.ts ...
│   └── _generated/
│
├── contracts/                    # Solidity smart contracts (via LazerForge: github.com/LazerTechnologies/LazerForge)
│   ├── MarginCallEscrow.sol      # Escrow/game contract
│   └── test/                     # Contract tests
│
├── lib/                          # (under src/) shared client/server libraries
│   ├── privy/                    # Privy config + hooks
│   ├── llm/                      # Shared OpenAI client (call-model.ts, schemas.ts, messages.ts)
│   ├── contracts/                # Contract ABIs + interaction helpers
│   ├── cdp/                      # CDP wallet/operator helpers
│   ├── agent/                    # Client-side agent helpers
│   ├── mcp/  siwa/               # MCP + SIWA client helpers
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
│   ├── use-approvals.ts
│   └── use-contract.ts           # Contract interaction hooks (wagmi)
│
├── packages/
│   └── mcp-server/               # Standalone stdio MCP server (@margin-call/mcp-server)
│
├── package.json
├── next.config.ts
├── foundry.toml                  # Foundry config for contract dev
└── .env.example
```

---

## Build Phases

> **Status (historical roadmap).** Phases 1–10, 12, and 13 have shipped; Phase 11 marketplace support has not. Two specifics below are out of date versus what actually shipped: the backend runs on **Convex** (not Supabase), and the agent loop runs on **Convex crons + scheduler** (not Vercel Workflow). The outcome/selection model is **`gpt-4o-mini`** (Wire uses `gpt-5-mini`). Phase 12 shipped in a different form: `$BLOW` is a per-trader capacity token, not an earn/stake/burn fuel loop. See [`docs/trader-fuel-token.md`](./trader-fuel-token.md). Tech names in the phase text below are preserved as the original plan of record.

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
- Narrate the mechanically decided and bounded outcome
- Record outcome history in Convex for the public reputation display
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
- Convex-backed public reputation display

### Phase 9: Assets + Wipeout System

- Assets gained/lost from deal outcomes
- Wipeout conditions (portfolio reaches 0)
- Contract handles wipeout fund transfer
- Wiped-out trader NFT remains as permanent record

### Phase 10: AI Deal Prompt Suggestions

- `POST /api/prompt/suggest` — AI-generated deal prompts
- `/deals/create` includes "suggest prompts" feature

### Phase 11: Trader Marketplace — Future

- `/marketplace` page — browse traders for sale
- Integration with OpenSea / Base NFT marketplaces
- Game-specific listing context (reputation, balance, P&L)
- Buy/sell flow

### Phase 12: `$BLOW` Capacity — Shipped On Base Sepolia

- Deploy a separate SeatVault for per-trader `$BLOW` principal
- Apply Gallery, Seat, and Corner Office capacity to cycle cadence and unresolved-entry limits
- Keep staking state out of selection, probability, payouts, rake, and deal creation
- Surface `$BLOW` balance, staking/unstaking state, and floor credentials in the desk UI
- Fail closed to Gallery when the active on-chain tier cannot be proven

### Phase 13: Polish + Launch

- Wall Street themed system prompts
- Rate limiting on API routes
- Sentry error monitoring
- Load test agent runtime
- Contract audit

### Upcoming Features

- **MCP Server** — Shipped. MCP-compatible agents run non-custodial desks using SIWE-issued keys and a Base Account treasury through prepare → `send_calls` → confirm.
- **Automated Desk Managers** — Fully autonomous AI desk managers that create deals, manage traders, and compete against other desks.
- **Desk-manager decision feedback** — Post-outcome "good call / bad call" ratings with structured reasons that help tune a desk's future trader behavior without changing settlement or public reputation. See [`docs/trader-decision-feedback.md`](./trader-decision-feedback.md).
- **Base mainnet launch plan** — Future, approval-gated work for official `$BLOW` supply/distribution, token and vault addresses, liquidity, compatibility evidence, and mainnet escrow activation. The Sepolia token is test infrastructure only.
- **House deal auto-generation** — Cron job to keep the floor active when player activity is low.
- **Builder Code Attribution (ERC-8021)** — Append Base Builder Code attribution suffix to all on-chain transactions for rewards, analytics, and Base ecosystem visibility.

---

## Verification

> Per-phase acceptance from the original build plan (historical). Substitute current tech where noted in the Build Phases banner: **Convex** for Supabase, **Convex crons + scheduler** for "Workflow", and **`gpt-4o-mini`** for "GPT-5 mini" (Wire uses `gpt-5-mini`).

1. **Phase 1:** `pnpm dev` runs Next.js, Privy login works, Convex dev deployment is up
2. **Phase 2:** Escrow contract deployed to testnet, can create deals and deposit funds
3. **Phase 3:** Trader NFT minted on ERC-8004 registry, ERC-6551 wallet derived
4. **Phase 4:** Deal creation from frontend writes to contract, mirrored to Supabase
5. **Phase 5:** Deal entry resolves via GPT-5 mini, contract distributes funds, reputation posted
6. **Phase 6:** Workflow scans deals, enters autonomously, logs activity, respects mandate
7. **Phase 7:** Mandate config, approval flow, close deal, fund/withdraw all work
8. **Phase 8:** Dashboard shows portfolio, activity feed, deal browsing, approval queue in realtime
9. **End-to-end:** Fund trader via contract -> workflow enters deal -> GPT-5 mini resolves -> contract settles -> reputation updated -> dashboard reflects outcome
