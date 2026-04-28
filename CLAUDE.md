# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wall Street Agent Trading Game — an AI-powered PvP trading game set on 1980s Wall Street. Players (desk managers) fund and configure AI trader agents that autonomously enter deals. OpenAI GPT-5 mini determines deal outcomes. Payments flow in USDC on Base via x402 protocol. See `docs/wall-street-agent-game.md` for the full game design spec.

## Commands

- `pnpm dev` — start dev server (Next.js on localhost:3000)
- `pnpm build` — production build
- `pnpm lint` — run ESLint (flat config, Next.js core-web-vitals + TypeScript rules)

## Tech Stack

- **Framework:** Next.js 16 (App Router) with React 19, TypeScript (strict mode)
- **Styling:** Tailwind CSS v4 with `tw-animate-css`, `class-variance-authority`, `tailwind-merge`, `clsx`
- **Data Fetching:** Convex hooks (`useQuery`/`useMutation`/`useAction` from `convex/react`) for all Convex-backed state. Plain `useEffect` + `fetch` for legacy API routes not yet on Convex.
- **UI Components:** Base UI (`@base-ui/react`) + shadcn/ui pattern, Lucide icons
- **Package Manager:** pnpm (workspace enabled)
- **Path alias:** `@/*` maps to `./src/*`

## Architecture (Planned)

The project is in early stages (scaffolded Next.js app). The target architecture from the design doc:

- **`src/app/`** — Next.js App Router pages + API routes (all backend logic in `app/api/`)
- **`src/lib/`** — Shared libraries: Supabase client/queries, Privy auth, OpenAI GPT-5 mini LLM integration, x402 payment middleware, agent runtime logic, CDP wallet operations
- **`src/components/`** — React components organized by domain (dashboard, trader, deal, shared)
- **`src/hooks/`** — React hooks for game state (traders, deals, activity, approvals)

### Key integrations to be built:

- **Auth/Wallet:** Privy (wallet connect, embedded wallets)
- **Database:** Supabase (Postgres + Realtime subscriptions)
- **Payments:** x402 protocol (USDC on Base via Coinbase facilitator)
- **Agent Wallets:** Coinbase CDP AgentKit (TEE-managed keys)
- **AI:** OpenAI GPT-5 mini (deal outcome generation + correction flow, structured outputs)
- **Agent Runtime:** Vercel Cron → `POST /api/agent/scheduler` fans out signed `POST /api/agent/cycle` per stale active trader; deal pick uses GPT-5 mini (mandate filter → desk dedup → LLM rank) with ratio fallback

### Core game loop (Vercel Workflow):

Scan deals → evaluate against mandate → check approval threshold → enter deal (x402) → resolve via GPT-5 mini → apply outcome → sleep 30s → loop

## Conventions

- Fonts: Geist Sans + Geist Mono via `next/font/google` (CSS variables `--font-geist-sans`, `--font-geist-mono`)
- ESLint flat config (`eslint.config.mjs`) with `eslint-config-next` core-web-vitals + TypeScript
- Use Convex hooks (`useQuery`/`useMutation`/`useAction` from `convex/react`) for all Convex-backed state. TanStack Query is **forbidden** for Convex-backed state — it has been removed from the project.
- For legacy Supabase/REST routes not yet on Convex, use plain `useEffect` + `fetch` (no TanStack). Query hooks live in `src/hooks/`.
