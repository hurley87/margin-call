# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Margin Call is a **NAV-weighted Pack-rip game** on Robinhood Chain. One global pool; a single kind of participant — a **user** — who creates Packs of tokenized stocks (as a **Maker**) and/or rips them (as a **Taker**). Selection is inversely weighted by a Pack's USD NAV and each Rip is priced at the live expected value plus a maker–taker surcharge, so cheap Packs come up often and rich ones rarely (the jackpot). Makers are made whole by a socialized, equal-rate **Acquisition Fee** (stablecoin); a game token (**Maker Emissions** + a **Buyer-Rebate** participation pot) is a steering layer streamed from an owner-funded **Distributor**. Authoritative design: **`docs/prd-margin-call.md`** (v2.0); domain glossary: **`CONTEXT.md`** (use its vocabulary — Maker, Taker, Rip, Pack, Acquisition Fee, Surcharge, Crown, Distributor, House). Full V1 build spec: GitHub issue #297.

**Current implementation state — read before editing `src/` or `convex/`.** The legacy Wall Street agent-game (desk managers, AI traders, deals, Wire) was removed in #298. The app is an **auth shell**: Privy email OTP + embedded wallet on a minimal landing page, SIWA scaffolding, and Convex with only `siwaNonces` (+ `me` identity query). Pack-rip UI and game Convex modules land next per #297. On the contracts side, `contracts/` (LazerForge Foundry) has **MockUSD**, **PackCustody**, **AssetRegistry**, **MockPriceFeed**, and **RipEngine** (selection + live pricing + Model-A settlement + Acquisition Fees) built and tested; **GameToken and the Distributor** land next per issue #297. Stock Token map: `contracts/deployments/robinhood-testnet.stock-tokens.json`. See `contracts/README.md`.

## Commands

- `pnpm dev` — start dev server (Next.js on localhost:3000)
- `pnpm build` — production build
- `pnpm lint` — run ESLint (flat config, Next.js core-web-vitals + TypeScript rules)
- `pnpm test` — Vitest (unit tests)
- `pnpm install:forge-deps` — install forge-std / OpenZeppelin into `contracts/lib`
- `pnpm test:contracts` / `pnpm test:contracts:ci` — Foundry suite
- `pnpm deploy:mockusd` / `pnpm verify:mockusd` — Robinhood testnet deploy + Blockscout verify
- `pnpm deploy:packcustody` / `pnpm verify:packcustody` — PackCustody deploy + verify
- `pnpm deploy:asset-registry` — AssetRegistry + MockPriceFeed seed (testnet verify in #310)
- `pnpm deploy:rip-engine` — RipEngine + MockRandomness (requires PackCustody / AssetRegistry / MockUSD addresses)

## Tech Stack

- **Framework:** Next.js 16 (App Router) with React 19, TypeScript (strict mode)
- **Styling:** Tailwind CSS v4 with `tw-animate-css`, `class-variance-authority`, `tailwind-merge`, `clsx`
- **Data Fetching:** `convex/react` for reactive backend state
- **UI Components:** Base UI (`@base-ui/react`) + shadcn/ui pattern
- **Contracts:** Foundry (`contracts/`), Robinhood Chain testnet
- **Package Manager:** pnpm
- **Path alias:** `@/*` maps to `./src/*`

## Architecture

Convex holds auth scaffolding; the rip rebuild will add on-chain reads and game state per `docs/prd-margin-call.md` and issue #297.

- **`src/app/`** — App Router pages + SIWA nonce route under `src/app/api/siwa/`. Home is a minimal Privy connect shell.
- **`convex/`** — `auth.config.ts`, `me.ts`, `siwaNonces.ts`, empty `http.ts`, schema (`siwaNonces` only), crons (SIWA nonce purge only).
- **`contracts/`** — Foundry workspace (MockUSD + PackCustody + AssetRegistry / MockPriceFeed + RipEngine today; GameToken + Distributor next). See `contracts/README.md` and `contracts/REPRODUCIBILITY.md`.
- **`src/lib/`** — Privy, SIWA, Convex server client, rate-limit, utils.
- **`src/components/`** — Providers (Privy/Wagmi/Convex), landing shell, UI primitives.
- **`src/hooks/`** — Network guard helpers (`use-base-network`).

### Key integrations:

- **Auth/Wallet:** Privy (email OTP, embedded EVM wallets on Robinhood testnet).
- **Database:** Convex (SIWA nonces + identity query today; game tables return with #297).
- **Contracts:** Foundry CI on every PR; MockUSD is the protocol mock stablecoin; AssetRegistry holds the Stock Token whitelist + NAV on Robinhood Chain testnet.

## Conventions

- Fonts: IBM Plex Mono + IBM Plex Sans Condensed via `next/font/google` (CSS variables `--font-plex-mono`, `--font-plex-sans`)
- ESLint flat config (`eslint.config.mjs`) with `eslint-config-next` core-web-vitals + TypeScript
- Use Convex hooks (`useQuery`/`useMutation`/`useAction` from `convex/react`) for Convex-backed state. TanStack Query is forbidden for Convex-backed state.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
