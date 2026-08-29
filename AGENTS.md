# AGENTS.md

## Project overview

Margin Call is a Next.js 16 application between product versions. The Crash game has been retired. The site shows a coming-soon landing page with no login. Use this repository as scaffolding for the next product:

- Privy (SMS + embedded wallet helpers retained, not mounted on the landing page)
- Convex (auth + empty HTTP router + empty schema)
- Foundry (reproducible workspace pins; no product contracts yet)

Do not treat future product contracts, UI, keeper, or indexing as implemented.

## Commands

- `pnpm dev` — dev server on localhost:3000
- `pnpm build` — production build
- `pnpm lint` — ESLint
- `pnpm typecheck` — TypeScript
- `pnpm test` — Vitest
- `pnpm install:forge-deps` — install Forge libraries into `contracts/lib`
- `pnpm test:contracts` / `pnpm test:contracts:ci` — Foundry workspace checks

## Caveats

- Foundry must be installed locally (`foundryup -i v1.4.3`) for contract checks.
- `contracts/lib/` is gitignored; run `pnpm install:forge-deps` after cloning.
- pnpm v10 may warn about ignored dependency build scripts; they are not required for the current checks.
- Sentry source-map uploads are disabled without `SENTRY_AUTH_TOKEN`.
- Convex schema shrink requires resetting any development deployment that still contains retired tables.
- Husky pre-commit runs Prettier on explicitly staged files.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
