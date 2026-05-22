# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Margin Call is a Next.js 16 (App Router) web app — an AI-powered PvP trading game on 1980s Wall Street. See `CLAUDE.md` for tech stack, commands, and architecture details. See `docs/wall-street-agent-game.md` for the full game design spec.

### Commands

Standard commands are in `package.json` scripts and documented in `CLAUDE.md`:

- `pnpm dev` — dev server on localhost:3000
- `pnpm build` — production build
- `pnpm lint` — ESLint (flat config)
- `pnpm test` — Vitest (unit tests)

### Dev server caveats

- Without `NEXT_PUBLIC_PRIVY_APP_ID`, `PrivyProvider` renders children without Privy/Wagmi/Convex wrappers; `usePrivy()` on the home page shows the unauthenticated state (CONNECT_WALLET screen).
- Upstash Redis is optional; the rate limiter falls back to in-memory when env vars are missing.
- Sentry source map uploads are disabled when `SENTRY_AUTH_TOKEN` is absent.
- **Agent trade loop:** Production uses Vercel Cron (`/api/agent/scheduler` with `CRON_SECRET`). Locally, resuming a trader still kicks one cycle immediately; call `POST /api/agent/scheduler` with `Authorization: Bearer $CRON_SECRET` (or wait for the next resume) to run additional cycles. Apply Supabase migration `024_trader_personality.sql` for the `personality` column.

### Build scripts (pnpm)

pnpm v10 blocks postinstall/build scripts by default. Running `pnpm install` will show a warning about ignored build scripts (esbuild, sharp, @sentry/cli, etc.). For the current test suite and dev server these are not required — vitest 4.x uses its own native transform, not esbuild. If native module builds are needed in the future, add `pnpm.onlyBuiltDependencies` to `package.json`.

### Pre-existing lint errors and test failures

- `pnpm lint` exits 1 due to pre-existing issues in some hooks/components and unused-variable warnings (see ESLint output).

### Git hooks

Husky pre-commit runs `npx lint-staged`, which runs Prettier on all staged files (`.lintstagedrc` config: `{ "*": "prettier --ignore-unknown --write" }`).

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
