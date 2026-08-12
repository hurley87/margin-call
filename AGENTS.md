# AGENTS.md

## Project overview

Margin Call is a Next.js 16 application being rebuilt around the Base Sepolia Crash Game Jam MVP. The prior Pack Rip application, backend flows, and contracts are retired. Use these documents as the source of truth:

- `CONTEXT.md` — canonical glossary for product terms across docs, contracts, and UI copy
- `docs/2026-08-07-margin-call-crash-prd.md`
- `docs/2026-08-08-margin-call-crash-technical-design.md`
- `docs/2026-08-08-margin-call-crash-roadmap.md`

The repository retains neutral Next.js, Convex, Privy, shared TypeScript, Foundry, and CI scaffolding. Do not treat future Crash contracts, UI, keeper, or indexing as implemented.

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
