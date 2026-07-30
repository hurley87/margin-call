# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Margin Call is a Next.js 16 (App Router) web app — a NAV-weighted Pack-rip game on Robinhood Chain. The agent-game UI/backend was torn down (#298); the app is currently a Privy connect shell plus SIWA/Convex auth scaffolding. See `CLAUDE.md` for tech stack and architecture. Design: `docs/prd-margin-call.md`; glossary: `CONTEXT.md`. Full V1 build: GitHub issue #297.

The Foundry workspace lives under `contracts/` (LazerForge-based). MockUSD and PackCustody are on Robinhood Chain testnet; AssetRegistry + MockPriceFeed (#300), RipEngine (#301, plus the Crown in #302), and GameToken + Distributor (#303/#304, on-chain Maker Emissions and equal-per-Rip Participation Rewards) are built with deploy scripts — testnet wire-up is #310. Stock Token map: `contracts/deployments/robinhood-testnet.stock-tokens.json`. See `contracts/README.md`.

### Commands

Standard commands are in `package.json` scripts and documented in `CLAUDE.md`:

- `pnpm dev` — dev server on localhost:3000
- `pnpm build` — production build
- `pnpm lint` — ESLint (flat config)
- `pnpm test` — Vitest (unit tests)
- `pnpm install:forge-deps` — install forge libs into `contracts/lib`
- `pnpm test:contracts` / `pnpm test:contracts:ci` — Foundry suite
- `pnpm deploy:mockusd` / `pnpm verify:mockusd` — Robinhood testnet deploy + verify
- `pnpm deploy:packcustody` / `pnpm verify:packcustody` — PackCustody deploy + verify
- `pnpm deploy:asset-registry` — AssetRegistry + MockPriceFeed seed
- `pnpm deploy:rip-engine` — RipEngine + MockRandomness
- `pnpm deploy:game-token` — GameToken (fixed supply minted to the treasury)
- `pnpm deploy:distributor` — Distributor + GameToken `DISTRIBUTOR_ROLE` grant

### Contracts caveats

- Foundry must be installed locally (`foundryup -i v1.4.3`) for `pnpm test:contracts` and deploy scripts.
- `contracts/lib/` is gitignored — always run `pnpm install:forge-deps` after clone.
- Deploy scripts require `ROBINHOOD_TESTNET_RPC_URL` and `DEPLOYER_PRIVATE_KEY` (or `OPERATOR_PRIVATE_KEY`). Never commit keys.

### Dev server caveats

- Without `NEXT_PUBLIC_PRIVY_APP_ID`, `PrivyProvider` renders children without Privy/Wagmi/Convex wrappers; `usePrivy()` on the home page shows the unauthenticated landing (connect CTA).
- Upstash Redis is optional; the rate limiter falls back to in-memory when env vars are missing.
- Sentry source map uploads are disabled when `SENTRY_AUTH_TOKEN` is absent.
- Convex schema is `siwaNonces` only after #298; reset the Convex deployment/data when pulling schema shrinks (no migration — DB is resettable).

### Build scripts (pnpm)

pnpm v10 blocks postinstall/build scripts by default. Running `pnpm install` will show a warning about ignored build scripts (esbuild, sharp, @sentry/cli, etc.). For the current test suite and dev server these are not required — vitest 4.x uses its own native transform, not esbuild. If native module builds are needed in the future, add `pnpm.onlyBuiltDependencies` to `package.json`.

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
