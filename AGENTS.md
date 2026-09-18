# AGENTS.md

## Project overview

Margin Call is a Next.js 16 application between product versions. The Crash game has been retired. The site shows a coming-soon landing page with a Dynamic wallet connect control. Use this repository as scaffolding for the next product:

- Dynamic (external EVM wallets on Base; wallet island included at build time when `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` is set)
- Convex (empty HTTP router + empty schema; no JWT auth until a product query needs identity)
- Foundry (reproducible workspace pins; product contracts live under `contracts/`)

Do not treat future product contracts, UI, keeper, or indexing as implemented.
The historical Base deployment (`contracts/deployments/base-nvda-only.legacy.json`) is the
legacy NVDA-only stack from issue #429. Source contracts are the canonical multi-stock
launch architecture (issue #446: NVDAc + AAPLc + METAc + GOOGLc). That launch stack is not
yet deployed; after it is, the frontend consumes `contracts/deployments/base.json`.

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
