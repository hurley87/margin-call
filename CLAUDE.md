# CLAUDE.md

## Project overview

Margin Call is being rebuilt as a shared-round Crash game for Base Sepolia. The retired Pack Rip implementation has been removed. Product decisions live in:

- `CONTEXT.md` — canonical glossary for product terms across docs, contracts, and UI copy
- `docs/2026-08-07-margin-call-crash-prd.md`
- `docs/2026-08-08-margin-call-crash-technical-design.md`
- `docs/2026-08-08-margin-call-crash-roadmap.md`

Do not infer that the Crash contracts or frontend are already implemented. Add them only through separately scoped work against the PRD and technical design.

## Commands

- `pnpm dev` — Next.js development server
- `pnpm build` — production build
- `pnpm lint` — ESLint
- `pnpm typecheck` — TypeScript
- `pnpm test` — Vitest
- `pnpm install:forge-deps` — install gitignored Foundry libraries
- `pnpm test:contracts` / `pnpm test:contracts:ci` — Foundry workspace checks

## Retained architecture

- `src/` — neutral Next.js shell, styling, authentication helpers, and UI primitives
- `convex/` — Convex auth and HTTP infrastructure
- `packages/shared/` — framework-neutral validation helpers
- `contracts/` — Foundry scaffolding; Crash product contracts are future work

## Conventions

- Next.js 16 App Router, React 19, and TypeScript strict mode
- Tailwind CSS v4 and shadcn-style UI primitives
- Use Convex hooks directly for future Convex-backed state
- Keep secrets out of client code, commits, and tool output
- Preserve the distinction between implemented behaviour and future design

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
