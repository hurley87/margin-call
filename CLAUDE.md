# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wall Street Agent Trading Game — an AI-powered PvP trading game set on 1980s Wall Street. Players (desk managers) fund and configure AI trader agents that autonomously enter deals. Deal odds are computed mechanically (market mood + SEC heat) and `gpt-4o-mini` narrates the outcome; the Wire narrative engine uses `gpt-5-mini`. See `docs/wall-street-agent-game.md` for the full game design spec.

On-chain escrow, SeatVault, Floor packet tooling, and MCP desk treasury have been removed pending a rebuild. Treat the repo as a Next + Convex shell until new money/contracts land.

## Commands

- `pnpm dev` — start dev server (Next.js on localhost:3000)
- `pnpm build` — production build
- `pnpm lint` — run ESLint (flat config, Next.js core-web-vitals + TypeScript rules)

## Tech Stack

- **Framework:** Next.js 16 (App Router) with React 19, TypeScript (strict mode)
- **Styling:** Tailwind CSS v4 with `tw-animate-css`, `class-variance-authority`, `tailwind-merge`, `clsx`
- **Data Fetching:** `convex/react` for game/dashboard reactive state; one-off REST calls use `authFetch` in hooks where no Convex query exists yet
- **UI Components:** Base UI (`@base-ui/react`) + shadcn/ui pattern, Lucide icons
- **Package Manager:** pnpm
- **Path alias:** `@/*` maps to `./src/*`

## Architecture

The game runs on a Convex backend with a thin Next.js HTTP layer. Convex is the sole source of truth for game state.

- **`src/app/`** — Next.js App Router pages + HTTP boundary under `src/app/api/` (SIWA and remaining helpers). Game CRUD lives in Convex functions, not REST.
- **`convex/`** — Backend source of truth: schema, queries/mutations/actions, agent runtime (`convex/agent/`), Wire engine (`convex/wire/`), crons (`convex/crons.ts`), CDP wallet ops (`convex/wallet.ts`).
- **`src/lib/`** — Shared client/server libraries: Privy auth, OpenAI client, SIWA helpers.
- **`src/components/`** — React components organized by domain (dashboard, trader, deal, wire, shared).
- **`src/hooks/`** — Convex (`convex/react`) hooks for game state (traders, deals, activity, approvals).

### Key integrations:

- **Auth/Wallet:** Privy (email OTP, embedded EVM wallets).
- **Database:** Convex (reactive database + scheduler/crons).
- **Agent Wallets:** Coinbase CDP smart accounts (`@coinbase/cdp-sdk`), minted server-side per trader where still wired.
- **AI:** Deal selection and outcome narration use `gpt-4o-mini`; the Wire narrative engine uses `gpt-5-mini`. Outcome odds are computed mechanically (market mood + SEC heat); the LLM only narrates the pre-decided result.
- **Agent Runtime:** Convex crons (`convex/crons.ts`) — `agent-scheduler` fires every 1 min → `internal.agent.scheduler.scheduler` fans out cycles. On-chain enter/settle paths are currently stubbed/fail-closed.

## Conventions

- Fonts: Geist Sans + Geist Mono via `next/font/google` (CSS variables `--font-geist-sans`, `--font-geist-mono`)
- ESLint flat config (`eslint.config.mjs`) with `eslint-config-next` core-web-vitals + TypeScript
- Use Convex hooks (`useQuery`/`useMutation`/`useAction` from `convex/react`) for all Convex-backed game/dashboard data. For legacy Next.js API routes without a Convex equivalent, use `authFetch` from hooks (avoid ad-hoc `fetch` in components).
- **Convex-backed state must use Convex hooks** (`useQuery`/`useMutation`/`useAction` from `convex/react`). TanStack Query is forbidden for Convex-backed state.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
