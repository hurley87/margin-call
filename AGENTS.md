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

## MCP development (BYO Base Account + prepare/confirm)

External agents (Claude Code) use the MCP plan (`plans/mcp.md`). **MCP desk treasury is non-custodial:** the agent brings its own wallet via [Base MCP](https://mcp.base.org).

### Required env (both .env.local and Convex)

- `MCP_API_KEY_SECRET` — HMAC secret used to hash `mc_live_*` keys before storage.
- `MCP_SERVICE_TOKEN` — authenticates the Next.js `/api/mcp/*` layer when it calls Convex HTTP actions (`/mcp/*`). Must be identical in both places.
- `OPERATOR_PRIVATE_KEY` — still required for `setDepositor` and autonomous deal entry (unchanged).
- CDP env (`CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`) — still required for **trader identity wallets** and the agent cron SIWA flow (not for desk treasury).

### Base MCP (agent wallet)

Add to `.cursor/mcp.json` or global MCP config:

```json
{
  "mcpServers": {
    "base-mcp": {
      "url": "https://mcp.base.org"
    }
  }
}
```

Authorize once in Base Account when prompted.

### Issuing a per-desk key (SIWE via Base MCP)

With Base MCP connected, the agent self-issues a key by signing a SIWE challenge:

1. `get_wallets` — read your Base Account address
2. `POST /api/mcp/keys/challenge` `{ "address": "0x..." }` — receive a SIWE message
3. Base MCP `sign` (personal_sign / EIP-191) — user approves in Base Account
4. `POST /api/mcp/keys` `{ "message": "...", "signature": "0x..." }` — receive `mc_live_*` key (once)

The signing Base Account is auto-bound as the desk treasury (`mcp:base:<address>`). No `set_desk_wallet` step on this path. To rotate or recover a lost key, repeat the SIWE handshake — the new key supersedes any prior key for that desk.

### Agent desk onboarding sequence

1. Issue MCP key (SIWE flow above) — wallet is pre-bound
2. Base MCP — fund your Base Account with USDC on Base Sepolia
3. `sync_wallet` — refresh Convex balance
4. `create_trader` — one-shot server mint (no Base MCP approval)
5. Treasury ops: `fund_trader` / `create_deal` / `close_deal` / `withdraw_from_trader` → **prepare** → Base MCP `send_calls` (approve) → `confirm_intent` with `intentId` + `txHash`

### Base MCP plugin (recommended on harness surfaces)

Margin Call also ships as a [Base MCP custom plugin](https://docs.base.org/ai-agents/plugins/custom-plugins): a markdown spec at `packages/mcp-server/base-plugin/margin-call.md` that drives `/api/mcp/*` over HTTP and executes treasury calldata via Base MCP `send_calls`. No separate stdio MCP process.

1. Connect Base MCP (`https://mcp.base.org`) and install the `base-mcp` skill.
2. Copy `packages/mcp-server/base-plugin/margin-call.md` into your skill's `plugins/` folder, or fetch from a running dev server:

   ```bash
   curl -s http://localhost:3000/api/mcp/plugin \
     -o ~/.cursor/skills/base-mcp/plugins/margin-call.md
   ```

3. Set `MARGIN_CALL_MCP_KEY` (and `MARGIN_CALL_API_URL` if not localhost:3000) in the harness environment.

Requires a harness with a direct HTTP tool (Claude Code, Cursor, Codex). Chat-only surfaces should use the standalone stdio MCP below.

### Running the margin-call MCP server locally (standalone)

```bash
MARGIN_CALL_MCP_KEY=mc_live_... \
MARGIN_CALL_API_URL=http://localhost:3000 \
npx tsx packages/mcp-server/src/index.ts
```

### Adding to Cursor / Claude Code (standalone stdio MCP)

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
    },
    "base-mcp": {
      "url": "https://mcp.base.org"
    }
  }
}
```

See `packages/mcp-server/README.md` and `plans/mcp.md`.
