![Margin Call](public/banner.png)

# Margin Call

Margin Call is between versions. The Crash game has been retired from this repository. The deployed site is a **Coming soon** placeholder while the next product is built.

## What's in the repo today

| Area               | State                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| `src/`             | Neutral Next.js 16 shell (coming-soon landing), authentication helpers, UI primitives |
| `convex/`          | Convex auth and HTTP infrastructure                                                   |
| `packages/shared/` | Framework-neutral validation helpers                                                  |
| `contracts/`       | Foundry scaffolding only — product contracts are future work                          |

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 · Convex · Privy · Foundry

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
