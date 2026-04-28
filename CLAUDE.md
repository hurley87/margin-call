# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wall Street Agent Trading Game — an AI-powered PvP trading game set on 1980s Wall Street. Players (desk managers) fund and configure AI trader agents that autonomously enter deals. OpenAI GPT-5 mini determines deal outcomes. Payments flow in USDC on Base via x402 protocol. See `docs/wall-street-agent-game.md` for the full game design spec.

## Commands

- `pnpm dev` — start dev server (Next.js on localhost:3000)
- `pnpm build` — production build
- `pnpm lint` — run ESLint (flat config, Next.js core-web-vitals + TypeScript rules)
- `pnpm test` — run Vitest tests
- `pnpm test:convex` — run Convex behavior tests (`convex/__tests__/`)

## Tech Stack

- **Framework:** Next.js 16 (App Router) with React 19, TypeScript (strict mode)
- **Styling:** Tailwind CSS v4 with `tw-animate-css`, `class-variance-authority`, `tailwind-merge`, `clsx`
- **Data Layer:** Convex (reactive queries, mutations, actions, cron scheduling)
- **UI Components:** Base UI (`@base-ui/react`) + shadcn/ui pattern, Lucide icons
- **Package Manager:** pnpm (workspace enabled)
- **Path alias:** `@/*` maps to `./src/*`

## Architecture

| Layer       | Owns                                                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Convex**  | Realtime game state, agent loop, internal scheduling, verified persistence of game events after HTTP boundaries run           |
| **Next.js** | x402 payment verification (`/api/deal/enter`), SIWA HTTP handlers (`/api/siwa/*`), prompt suggestions (`/api/prompt/suggest`) |
| **Privy**   | Auth and wallets (sessions; embedded / connected wallets)                                                                     |
| **UI**      | Convex React hooks only for Convex-backed state — no TanStack Query for that data                                             |

- **`convex/`** — All backend logic: schema, queries, mutations, actions, crons, agent loop
- **`src/app/`** — Next.js App Router pages + surviving API routes (deal/enter, siwa/\*, prompt/suggest)
- **`src/lib/`** — Shared libraries: Convex server client, Privy auth, OpenAI LLM, x402 payment, CDP wallet operations
- **`src/components/`** — React components organized by domain (dashboard, trader, deal, shared)
- **`src/hooks/`** — React hooks for game state; Convex-backed hooks in `use-convex-*.ts`

### Key integrations:

- **Auth/Wallet:** Privy (wallet connect, embedded wallets) bridged to Convex via `convex/auth.config.ts`
- **Database:** Convex (reactive queries, `convex/schema.ts` is the single source of truth)
- **Payments:** x402 protocol (USDC on Base via Coinbase facilitator) — verified in Next.js, recorded in Convex
- **Agent Wallets:** Coinbase CDP SDK (TEE-managed keys; called from Convex actions)
- **AI:** OpenAI GPT-5 mini (deal outcome generation + correction flow, structured outputs)
- **Agent Runtime:** Convex cron (`convex/crons.ts`) → `internalAction` scheduler → per-trader cycle actions

### Core game loop (Convex Scheduler):

Convex cron fires every minute → `agent.scheduler` queries stale active traders → `ctx.scheduler.runAfter(0, agent.cycle, { traderId })` per trader → cycle: load trader + mandate → deal selection → approval check → call `/api/deal/enter` (x402 verify) → Convex records verified entry → apply outcome

## Conventions

- Fonts: Geist Sans + Geist Mono via `next/font/google` (CSS variables `--font-geist-sans`, `--font-geist-mono`)
- ESLint flat config (`eslint.config.mjs`) with `eslint-config-next` core-web-vitals + TypeScript
- **Convex-backed state MUST use Convex hooks** (`useQuery`/`useMutation`/`useAction` from `convex/react`). Do NOT use TanStack Query or `useEffect` + `fetch()` for game/dashboard state.
- TanStack Query is only acceptable for non-Convex HTTP endpoints (e.g. `/api/prompt/suggest`).
- New Convex queries and mutations go in `convex/` — never in `src/app/api/` unless they require HTTP boundary semantics (x402, SIWA, webhooks).
