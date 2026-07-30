# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Margin Call is a **NAV-weighted Pack-rip game** on Robinhood Chain. One global pool; a single kind of participant — a **user** — who creates Packs of tokenized stocks (as a **Maker**) and/or rips them (as a **Taker**). Selection is inversely weighted by a Pack's USD NAV and each Rip is priced at the live expected value plus a maker–taker surcharge, so cheap Packs come up often and rich ones rarely (the jackpot). Makers are made whole by a socialized, equal-rate **Acquisition Fee** (stablecoin); a game token (**Maker Emissions** + **Participation Rewards**) is a steering layer streamed from an owner-funded **Distributor**. Authoritative design: **`docs/prd-margin-call.md`** (v2.0); domain glossary: **`CONTEXT.md`** (use its vocabulary — Maker, Taker, Rip, Pack, Acquisition Fee, Surcharge, Crown, Distributor, House). Full V1 build spec: GitHub issue #297.

**Current implementation state — read before editing `src/` or `convex/`.** The legacy Wall Street agent-game was removed in #298. V1 contracts are **deployed and verified on Robinhood testnet** (#310). The app shell (#305) is Privy connect + **Starter Grant** (MockUSD mint) + **Browse Pool** (Convex-indexed RipEngine/PackCustody state). Maker/Taker write flows and claims land next (#306–#308). Stock Token map: `contracts/deployments/robinhood-testnet.stock-tokens.json`. See `contracts/README.md`.

**Convex env for #305** (after `npx convex env set`): `MOCKUSD_ADDRESS`, `PACKCUSTODY_ADDRESS`, `ASSETREGISTRY_ADDRESS`, `RIPENGINE_ADDRESS`, `ROBINHOOD_TESTNET_RPC_URL`, `STARTER_GRANT_MINTER_PRIVATE_KEY` (wallet must hold MockUSD `MINTER_ROLE`). Mirror `NEXT_PUBLIC_*` contract addresses in `.env.local` for the client.

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
- `pnpm deploy:game-token` — GameToken (fixed supply minted to the treasury)
- `pnpm deploy:distributor` — Distributor + GameToken `DISTRIBUTOR_ROLE` grant (requires GameToken address)

## Tech Stack

- **Framework:** Next.js 16 (App Router) with React 19, TypeScript (strict mode)
- **Styling:** Tailwind CSS v4 with `tw-animate-css`, `class-variance-authority`, `tailwind-merge`, `clsx`
- **Data Fetching:** `convex/react` for reactive backend state
- **UI Components:** Base UI (`@base-ui/react`) + shadcn/ui pattern
- **Contracts:** Foundry (`contracts/`), Robinhood Chain testnet
- **Package Manager:** pnpm
- **Path alias:** `@/*` maps to `./src/*`

## Architecture

Convex indexes on-chain pool state and issues Starter Grants; Maker/Taker txs remain user-signed on-chain (#306+).

- **`src/app/`** — App Router pages + SIWA nonce route under `src/app/api/siwa/`. Home: Privy land → connected shell with grant + Browse Pool.
- **`convex/`** — auth, `siwaNonces`, `starterGrants` / mint actions, pool index (`pool`, `poolIndexer*`), crons (nonce purge + pool sync).
- **`contracts/`** — Foundry workspace (MockUSD + PackCustody + AssetRegistry / MockPriceFeed + RipEngine + GameToken + Distributor). See `contracts/README.md` and `contracts/REPRODUCIBILITY.md`.
- **`src/lib/`** — Privy, SIWA, contracts ABIs/clients, grants policy, pool helpers, Convex server client, rate-limit, utils.
- **`src/components/`** — Providers, landing, grants panel, Browse Pool, UI primitives.
- **`src/hooks/`** — Network guard helpers (`use-base-network`).

### Key integrations:

- **Auth/Wallet:** Privy (email OTP, embedded EVM wallets on Robinhood testnet).
- **Database:** Convex (SIWA nonces, Starter Grants, packs + poolSnapshots).
- **Contracts:** Live on Robinhood testnet; addresses in `contracts/deployments/` and `src/lib/contracts/addresses.ts`.

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
