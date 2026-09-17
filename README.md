![Margin Call](public/banner.png)

# Margin Call

Margin Call is between versions. The Crash game has been retired from this repository. The deployed site is a **Coming soon** placeholder while the next product is built.

## What's in the repo today

| Area               | State                                                                            |
| ------------------ | -------------------------------------------------------------------------------- |
| `src/`             | Next.js 16 shell (coming-soon landing + Dynamic wallet connect), UI primitives   |
| `convex/`          | Empty HTTP router and schema; no JWT auth until a product feature needs identity |
| `packages/shared/` | Framework-neutral validation helpers                                             |
| `contracts/`       | Foundry workspace with landed V1 Position NFT slices — see `CLAUDE.md`           |

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 · Convex · Dynamic · Foundry · viem

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Copy `.env.example` to `.env.local` for the required environment variables.

### Dynamic dashboard

For local wallet connect:

1. Create an environment in the [Dynamic console](https://console.dynamic.xyz/dashboard/developer/api) and set `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID`.
2. Enable **external EVM wallets** and **Base (8453)**.
3. Allowlist `http://localhost:3000` (and production origin).
4. Prefer **in-app** auth token storage (needed later for any Convex JWT bridge).

Without the environment ID, the coming-soon page still renders and the Connect control stays hidden.

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
