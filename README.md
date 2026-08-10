![Margin Call](public/banner.png)

# Margin Call

Margin Call is being rebuilt as a shared-round **Crash** game on Base Sepolia: every minute a new round opens, players post Circle testnet USDC (tUSDC) as margin and pick an Arcade Leverage multiple, and a confidential crash point (Inco Lightning) decides whether the position clears or gets the margin call. Liquidity lives in a community-funded ERC-4626 bankroll vault.

The retired Pack Rip implementation has been removed. **No Crash contract or gameplay frontend is implemented yet** — the deployed site is a placeholder while the rebuild is specified in:

- [`docs/2026-08-07-margin-call-crash-prd.md`](docs/2026-08-07-margin-call-crash-prd.md) — product requirements
- [`docs/2026-08-08-margin-call-crash-technical-design.md`](docs/2026-08-08-margin-call-crash-technical-design.md) — contract and settlement mechanics
- [`docs/2026-08-08-margin-call-crash-roadmap.md`](docs/2026-08-08-margin-call-crash-roadmap.md) — deferred product and token decisions

## What's in the repo today

| Area               | State                                                                              |
| ------------------ | ---------------------------------------------------------------------------------- |
| `src/`             | Neutral Next.js 16 shell (placeholder page), authentication helpers, UI primitives |
| `convex/`          | Convex auth and HTTP infrastructure                                                |
| `packages/shared/` | Framework-neutral validation helpers                                               |
| `contracts/`       | Foundry scaffolding only — Crash product contracts are future work                 |

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 · Convex · Privy (server auth) · Foundry

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Copy `.env.example` to `.env.local` for the required environment variables.

## Commands

| Command                   | Description                                  |
| ------------------------- | -------------------------------------------- |
| `pnpm dev`                | Start dev server (Next.js on localhost:3000) |
| `pnpm build`              | Production build                             |
| `pnpm lint`               | Run ESLint                                   |
| `pnpm typecheck`          | TypeScript check                             |
| `pnpm test`               | Vitest unit tests                            |
| `pnpm install:forge-deps` | Install gitignored Foundry libraries         |
| `pnpm test:contracts`     | Foundry workspace checks                     |
