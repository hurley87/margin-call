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

## MCP development (Phase 1 scaffold)

The initial thin end-to-end for external agents (Claude Code) lives under the MCP plan (`plans/mcp.md`, GitHub #137).

### Required env (both .env.local and Convex)

- `MCP_API_KEY_SECRET` — HMAC secret used to hash `mc_live_*` keys before storage.
- `MCP_SERVICE_TOKEN` — authenticates the Next.js `/api/mcp/*` layer when it calls the Convex HTTP actions (`/mcp/*`). Must be identical in both places.

Set the Convex one with:

```
npx convex env set MCP_API_KEY_SECRET "..." --dev
npx convex env set MCP_SERVICE_TOKEN "..." --dev
```

### Issuing a per-desk key (for yourself or a test desk)

While authenticated in the web app (Privy), POST to the issuance endpoint:

```bash
curl -X POST http://localhost:3000/api/mcp/keys \
  -H "Authorization: Bearer $PRIVY_JWT_FROM_BROWSER" \
  -H "Content-Type: application/json"
```

The response contains the raw `key` (shown once). The key is bound to your existing `deskManager` row.

(You can also call the same route from browser devtools / a one-off script that re-uses your existing Convex client after login.)

### Running the MCP server locally

```bash
MARGIN_CALL_MCP_KEY=mc_live_... \
MARGIN_CALL_API_URL=http://localhost:3000 \
npx tsx packages/mcp-server/src/index.ts
```

It speaks stdio and registers the `get_desk` tool.

### Adding to Cursor / Claude Code (local path, before npm publish)

Example entry (`.mcp.json` or via UI):

```json
{
  "mcpServers": {
    "margin-call": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "/absolute/path/to/margin-call/packages/mcp-server/src/index.ts"
      ],
      "env": {
        "MARGIN_CALL_MCP_KEY": "mc_live_...",
        "MARGIN_CALL_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

After restart you should be able to call `get_desk` and receive the JSON snapshot (wallet, balance, counts, recent P&L, funding hint when zero).

See also `packages/mcp-server/README.md` and the full architecture in `plans/mcp.md`.
