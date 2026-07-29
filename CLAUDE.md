# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Margin Call is a **NAV-weighted Pack-rip game** on Robinhood Chain. One global pool; a single kind of participant — a **user** — who creates Packs of tokenized stocks (as a **Maker**) and/or rips them (as a **Taker**). Selection is inversely weighted by a Pack's USD NAV and each Rip is priced at the live expected value plus a maker–taker surcharge, so cheap Packs come up often and rich ones rarely (the jackpot). Makers are made whole by a socialized, equal-rate **Acquisition Fee** (stablecoin); a game token (**Maker Emissions** + a **Buyer-Rebate** participation pot) is a steering layer streamed from an owner-funded **Distributor**. Authoritative design: **`docs/prd-margin-call.md`** (v2.0); domain glossary: **`CONTEXT.md`** (use its vocabulary — Maker, Taker, Rip, Pack, Acquisition Fee, Surcharge, Crown, Distributor, House). Full V1 build spec: GitHub issue #297.

**Current implementation state — read before editing `src/` or `convex/`.** The app code still implements the _prior_ concept: a "Wall Street agent trading game" (desk managers, AI trader agents, deals, `gpt-4o-mini` outcome narration, the `gpt-5-mini` Wire engine). That code — `convex/agent/`, `convex/wire/`, `convex/deals.ts`, `convex/traders.ts`, and the matching `src/components` domains — is **legacy, being rebuilt toward the rip model above**. Treat the PRD/spec as the target, not the current game logic. On the contracts side, `contracts/` (LazerForge Foundry) has **MockUSD** and **PackCustody** built and tested; **AssetRegistry, RipEngine, GameToken, and the Distributor** land next per issue #297. See `contracts/README.md`.

## Commands

- `pnpm dev` — start dev server (Next.js on localhost:3000)
- `pnpm build` — production build
- `pnpm lint` — run ESLint (flat config, Next.js core-web-vitals + TypeScript rules)
- `pnpm install:forge-deps` — install forge-std / OpenZeppelin into `contracts/lib`
- `pnpm test:contracts` / `pnpm test:contracts:ci` — Foundry suite
- `pnpm deploy:mockusd` / `pnpm verify:mockusd` — Robinhood testnet deploy + Blockscout verify

## Tech Stack

- **Framework:** Next.js 16 (App Router) with React 19, TypeScript (strict mode)
- **Styling:** Tailwind CSS v4 with `tw-animate-css`, `class-variance-authority`, `tailwind-merge`, `clsx`
- **Data Fetching:** `convex/react` for game/dashboard reactive state; one-off REST calls use `authFetch` in hooks where no Convex query exists yet
- **UI Components:** Base UI (`@base-ui/react`) + shadcn/ui pattern, Lucide icons
- **Contracts:** Foundry (`contracts/`), Robinhood Chain testnet
- **Package Manager:** pnpm
- **Path alias:** `@/*` maps to `./src/*`

## Architecture

The game runs on a Convex backend with a thin Next.js HTTP layer. Convex is the sole source of truth for game state. _This section describes the current (legacy agent-game) backend; the rip rebuild will reshape the Convex schema/functions and add on-chain reads per `docs/prd-margin-call.md` and issue #297._

- **`src/app/`** — Next.js App Router pages + HTTP boundary under `src/app/api/` (SIWA and remaining helpers). Game CRUD lives in Convex functions, not REST.
- **`convex/`** — Backend source of truth: schema, queries/mutations/actions, agent runtime (`convex/agent/`), Wire engine (`convex/wire/`), crons (`convex/crons.ts`), CDP wallet ops (`convex/wallet.ts`).
- **`contracts/`** — Foundry workspace (MockUSD today; Pack economy contracts next). See `contracts/README.md` and `contracts/REPRODUCIBILITY.md`.
- **`src/lib/`** — Shared client/server libraries: Privy auth, OpenAI client, SIWA helpers.
- **`src/components/`** — React components organized by domain (dashboard, trader, deal, wire, shared).
- **`src/hooks/`** — Convex (`convex/react`) hooks for game state (traders, deals, activity, approvals).

### Key integrations:

- **Auth/Wallet:** Privy (email OTP, embedded EVM wallets).
- **Database:** Convex (reactive database + scheduler/crons).
- **Agent Wallets:** Coinbase CDP smart accounts (`@coinbase/cdp-sdk`), minted server-side per trader where still wired.
- **AI (legacy):** Deal selection and outcome narration use `gpt-4o-mini`; the Wire narrative engine uses `gpt-5-mini`. Outcome odds are computed mechanically (market mood + SEC heat); the LLM only narrates the pre-decided result. The rip model has no LLM in the core loop — selection/pricing are deterministic on-chain math — so this is legacy pending rebuild.
- **Agent Runtime (legacy):** Convex crons (`convex/crons.ts`) — `agent-scheduler` fires every 1 min → `internal.agent.scheduler.scheduler` fans out cycles. On-chain enter/settle paths are stubbed/fail-closed. The rip model has no clockwork trader agents (users rip directly), so this runtime is legacy.
- **Contracts:** Foundry CI on every PR; MockUSD is the protocol mock stablecoin for Desk Grants on Robinhood Chain testnet.

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
