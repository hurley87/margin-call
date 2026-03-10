# Margin Call — AI-Powered PvP Trading Game

A zero-sum trading game set on 1980s Wall Street. Players act as **desk managers** — funding and configuring AI **trader agents** that autonomously enter deals. GPT-5 mini determines deal outcomes. All money flows in USDC on Base through a smart contract escrow. Traders are ERC-8004 NFTs with on-chain identity and reputation.

## How It Works

1. **Sign up** — Connect wallet via Privy, become a desk manager
2. **Hire** — Mint a trader agent (ERC-8004 NFT with its own wallet)
3. **Fund** — Deposit USDC into the escrow contract for your trader
4. **Configure** — Set risk tolerance, deal filters, approval thresholds
5. **Watch** — Agent autonomously scans and enters deals
6. **Intervene** — Approve/reject big deals, adjust strategy
7. **Cash out** — Withdraw USDC from escrow back to your wallet
8. **Trade up** — Sell high-performing traders as NFTs

### The PvP Dynamic

- **Deal creators** write prompts that sound lucrative but are traps — they profit when traders lose
- **Trader agents** evaluate deals against their mandate and try to extract value
- **Desk managers** set strategy, write deal prompts, and intervene on high-stakes decisions
- Every dollar gained by one party was lost by another

## Tech Stack

| Layer                  | Technology                                             |
| ---------------------- | ------------------------------------------------------ |
| **App**                | Next.js 16 (App Router), React 19, TypeScript (strict) |
| **Styling**            | Tailwind CSS v4, shadcn/ui, class-variance-authority   |
| **Data Fetching**      | TanStack React Query                                   |
| **Auth / Wallet**      | Privy (wallet connect, embedded wallets)               |
| **Smart Contracts**    | Solidity escrow contract on Base                       |
| **Agent Identity**     | ERC-8004 (Identity + Reputation Registries on Base)    |
| **Agent Wallets**      | ERC-6551 (Token Bound Accounts)                        |
| **Database**           | Supabase (Postgres + Realtime)                         |
| **AI / LLM**           | OpenAI GPT-5 mini (deal outcomes, prompt suggestions)  |
| **Agent Runtime**      | Vercel Workflow (durable trade cycle)                  |
| **Gasless Onboarding** | Coinbase Smart Wallets (sponsored gas on Base)         |

## Getting Started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Commands

| Command      | Description                                  |
| ------------ | -------------------------------------------- |
| `pnpm dev`   | Start dev server (Next.js on localhost:3000) |
| `pnpm build` | Production build                             |
| `pnpm lint`  | Run ESLint                                   |

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── page.tsx            # Dashboard
│   ├── traders/            # Trader roster + detail pages
│   ├── deals/              # Deal detail pages
│   ├── leaderboard/        # Rankings
│   ├── wire/               # Market wire feed
│   └── api/                # API routes
│       ├── trader/         # Create, list, pause, resume, deposit, withdraw
│       ├── deal/           # Create, enter, list, resolve
│       ├── desk/           # Register, configure, approve
│       ├── activity/       # Global activity feed
│       ├── leaderboard/    # Rankings
│       └── agent-cycle/    # Autonomous trading loop
├── components/             # React components
│   ├── market-wire.tsx     # Live market feed
│   ├── feed-line.tsx       # Feed line items
│   ├── nav.tsx             # Navigation
│   ├── music-player.tsx    # Retro music player
│   ├── providers/          # Auth, query, theme providers
│   └── ui/                 # shadcn/ui components
├── hooks/                  # TanStack Query hooks
│   ├── use-traders.ts      # Trader state
│   ├── use-deals.ts        # Deal state
│   ├── use-activity-feed.ts
│   ├── use-portfolio.ts
│   ├── use-leaderboard.ts
│   └── ...
├── lib/                    # Shared libraries
│   ├── agent/              # Agent runtime logic
│   ├── cdp/                # Coinbase CDP wallet operations
│   ├── contracts/          # Contract ABIs + interaction
│   ├── llm/                # GPT-5 mini integration
│   ├── supabase/           # DB client, queries, realtime
│   ├── privy/              # Auth config
│   └── rate-limit.ts       # API rate limiting
contracts/                  # Solidity (MarginCallEscrow)
docs/                       # Game design spec + growth strategy
```

## Architecture

```
Desk Manager (Privy wallet)
  │  create deals / fund traders / withdraw
  ▼
┌──────────────────────────────────────────┐
│  ESCROW CONTRACT (Base)                  │
│  Deal pots, trader balances, fees        │
│  ERC-8004 NFT ownership = authorization  │
└──────────────────────────────────────────┘
  ▲                        ▲
  │                        │
Server (Oracle)        ERC-8004 Registries
  │ resolveEntry()         │ Identity (NFTs)
  │ LLM resolution         │ Reputation
  ▼                        │
┌──────────────────────────────────────────┐
│  NEXT.JS APP                             │
│  API routes + Vercel Workflow            │
│  GPT-5 mini (deal outcomes)             │
│  Supabase (game state + realtime)        │
└──────────────────────────────────────────┘
```

## Revenue Model

- **5%** of every deal pot at creation
- **10%** rake on trader winnings

Both held in the escrow contract.

## Game Design

See [`docs/wall-street-agent-game.md`](docs/wall-street-agent-game.md) for the full game design spec covering money flows, wipeout conditions, LLM integration, agent runtime, and build phases.
