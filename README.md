![Margin Call](public/banner.png)

# Margin Call — AI-Powered PvP Trading Game

A zero-sum trading game set on 1980s Wall Street. Players act as **desk managers** — funding and configuring AI **trader agents** that autonomously enter deals. Deal odds are computed mechanically (market mood + SEC heat) and `gpt-4o-mini` narrates each outcome; the market Wire uses `gpt-5-mini`. All money flows in USDC on Base through a smart contract escrow. Traders are ERC-8004 NFTs with on-chain identity and reputation.

## How It Works

1. **Sign up** — Enter by email OTP through Privy, receive an embedded desk wallet
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

| Layer                  | Technology                                                              |
| ---------------------- | ----------------------------------------------------------------------- |
| **App**                | Next.js 16 (App Router), React 19, TypeScript (strict)                  |
| **Styling**            | Tailwind CSS v4, shadcn/ui, class-variance-authority                    |
| **Data Fetching**      | Convex reactive queries (`convex/react` hooks)                          |
| **Auth / Wallet**      | Privy email OTP, embedded EVM wallets, sponsored user transactions      |
| **Smart Contracts**    | Solidity escrow contract on Base                                        |
| **Agent Identity**     | ERC-8004 (Identity + Reputation Registries on Base)                     |
| **Agent Wallets**      | ERC-6551 (Token Bound Accounts)                                         |
| **Database**           | Convex (reactive database + scheduler/crons)                            |
| **AI / LLM**           | `gpt-4o-mini` (deal selection + outcome narration), `gpt-5-mini` (Wire) |
| **Agent Runtime**      | Convex crons + scheduler (1-min heartbeat → per-trader cycle)           |
| **Gasless Onboarding** | Privy sponsored transactions on Base Sepolia                            |

## Privy Setup

Required dashboard settings:

- Email OTP enabled
- Embedded EVM wallets enabled
- Gas sponsorship enabled for Base Sepolia

Required environment variables:

- `NEXT_PUBLIC_PRIVY_APP_ID`
- `PRIVY_APP_SECRET`

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
│   └── api/                # HTTP boundary (game CRUD lives in Convex, not REST)
│       ├── deal/enter/     # Operator-signed on-chain deal entry (SIWA-authed)
│       ├── mcp/            # MCP reads + treasury prepare/confirm, key issuance, plugin
│       └── siwa/           # Sign-In-With-Account nonce/handshake
├── components/             # React components
│   ├── market-wire.tsx     # Live market feed
│   ├── feed-line.tsx       # Feed line items
│   ├── nav.tsx             # Navigation
│   ├── music-player.tsx    # Retro music player
│   ├── providers/          # Auth, query, theme providers
│   └── ui/                 # shadcn/ui components
├── hooks/                  # Convex (`convex/react`) hooks
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
│   ├── llm/                # Shared OpenAI client (model calls, schemas)
│   ├── convex/             # Server-side Convex client helpers
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
│  NEXT.JS APP + CONVEX BACKEND            │
│  HTTP boundary + Convex crons/scheduler  │
│  gpt-4o-mini outcomes / gpt-5-mini Wire  │
│  Convex (game state + reactivity)        │
└──────────────────────────────────────────┘
```

## Revenue Model

- **5%** of every deal pot at creation
- **10%** rake on trader winnings

Both held in the escrow contract.

## Game Design

See [`docs/wall-street-agent-game.md`](docs/wall-street-agent-game.md) for the full game design spec covering money flows, wipeout conditions, LLM integration, agent runtime, and build phases.
