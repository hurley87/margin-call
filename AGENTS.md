# AGENTS.md

## Project overview

Margin Call is a Next.js 16 Base Position NFT application. The Crash game has been retired. The product surface is
landed and wired to the canonical multi-stock deployment: `/` (portfolio), `/positions` (explore), `/create`,
`/position/[tokenId]`, and `GET /api/nft/[tokenId]`, with a working connect → open → repay → close write path.

- Dynamic (website: external EVM wallets on Base; agent reference: server wallets in `src/lib/wallets/`. Dynamic is not required — the public agent surface is wallet-agnostic.)
- Convex (Position NFT lifecycle index: `positions` + `syncState`, discovery queries, a `syncTransaction` receipt action, and a 10-minute reconcile cron; HTTP router still empty; no JWT auth until a product query needs identity)
- Foundry (reproducible workspace pins; product contracts live under `contracts/`)

Position lifecycle indexing is implemented; keeper automation and executor / reduce-exposure / liquidate UI are not.
Convex is a discovery read model — Base stays authoritative for debt, NAV, and risk, and no Convex function verifies
that the caller owns the `owner` it queries.

The public agent surface (issue #491) is live: six unauthenticated, wallet-agnostic tools in `src/lib/agent/`,
exposed as thin HTTP routes under `src/app/api/agent/` and as a Streamable HTTP MCP endpoint at
`src/app/api/mcp/route.ts`. It reads and prepares only — `prepare_open` returns unsigned Base calldata and nothing
in that surface signs or broadcasts. Both transports call the same core functions, so they cannot disagree. See
[`docs/agent-api.md`](docs/agent-api.md). Write tools (`repay`, `close`, `liquidate`) are not exposed yet.

The live Base deployment (`contracts/deployments/base.json`) is the canonical multi-stock
launch stack (issue #446: NVDAc + AAPLc + METAc + GOOGLc). The historical NVDA-only
deployment is preserved at `contracts/deployments/base-nvda-only.legacy.json`; do not
point the frontend at those addresses. `src/` and `convex/` both consume only `base.json`.

The living Position NFT slice (issue #461 — optional on-chain thesis, HTTPS `tokenURI`,
`GET /api/nft/[tokenId]`, stage artwork under `public/`) is **live on Base**. It changed
`MarginCall`, so it required the coordinator-only redeploy in
`contracts/script/BASE_LAUNCH.md`; that landed on 2026-09-18 and `base.json` now points at the
coordinator that has `thesisOf` and the five-argument `openPosition`. The retired pair is kept
under `retiredCoordinator` in that manifest for provenance — never point the frontend at it.

`GET /api/nft/[tokenId]` makes five Base reads per request, which the public RPC rate-limits.
Production needs the server-only `BASE_RPC_URL` set, or the route returns 502 under load.
Explore (`/positions`) shows live health by fetching that same payload
(`src/components/positions/explore-gallery.tsx`); the portfolio list stays Convex
identity/lifecycle with neutral ticker logos and makes neither read. Explore multiplies
those five reads by the live positions on screen. `buildNftMetadata` swaps in the healthy
dog so marketplaces do not cache the ticker through a halt; Explore unwraps that same
`metadata.image` instead of recomputing artwork from Stage. `faceFromStage` keeps unpriced
positions on the ticker logo on surfaces that do not read metadata (detail, portfolio).

## Commands

- `pnpm dev` — dev server on localhost:3000
- `pnpm build` — production build
- `pnpm lint` — ESLint
- `pnpm typecheck` — TypeScript
- `pnpm agent:wallet` — provision or resolve a Dynamic server wallet (reference agent demo; Base only)
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
