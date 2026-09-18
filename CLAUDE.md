# CLAUDE.md

## Project overview

Margin Call is between product versions. The Crash game has been retired from this repository. The site is a minimal Base Position workspace (Dynamic wallet → viem → canonical contracts) that proves open → repay → close. Stack scaffolding remains for the next build:

- `CONTEXT.md` — product glossary
- Dynamic wallet foundation + `src/lib/protocol/` (reads/writes `contracts/deployments/base.json`); Convex remains empty schema/HTTP with no JWT auth yet
- `contracts/` has started landing product contracts, one scoped slice at a time

Do not infer that the production frontend is already implemented, or that a contract slice covers more than it says. Add
capability only through separately scoped work.

## Commands

- `pnpm dev` — Next.js development server
- `pnpm build` — production build
- `pnpm lint` — ESLint
- `pnpm typecheck` — TypeScript
- `pnpm test` — Vitest
- `pnpm install:forge-deps` — install gitignored Foundry libraries
- `pnpm test:contracts` / `pnpm test:contracts:ci` — Foundry workspace checks
- `pnpm test:contracts:fork` — Base mainnet fork checks (RPC required)
- `pnpm test:contracts:smoke` — local Anvil signer smoke harness

## Retained architecture

- `src/` — Next.js shell, Dynamic wallet, minimal Base Position workspace, styling, and UI primitives
- `convex/` — Convex HTTP infrastructure (empty schema; no JWT providers yet).
  When the first authed Convex table or function lands, add Dynamic `customJwt` in
  `convex/auth.config.ts`:
  - issuer: `https://app.dynamicauth.com/${DYNAMIC_ENVIRONMENT_ID}`
  - jwks: `https://app.dynamicauth.com/api/v0/sdk/${DYNAMIC_ENVIRONMENT_ID}/.well-known/jwks`
  - algorithm: `RS256`
  - applicationID: exact `aud` from a live Dynamic access token
- `packages/shared/` — framework-neutral validation helpers
- `contracts/` — Foundry workspace. `src/MarginCall.sol` is the Position NFT coordinator (curated
  multi-stock custody + ERC-721 ownership), supported by `CreditPool.sol`, per-stock `OracleAdapter` /
  `ExecutionAdapter` instances, `OracleStatePolicy.sol`, shared `V1Config.sol` risk pins, and
  `LaunchAssets.sol` (test/script pins only). Landed slices, in order:
  - spot-only open and close (`openPosition` at 1.0x, `closePosition`)
  - financed open against protocol credit (Uniswap-only execution, `LIVE` pricing required)
  - lazy debt accrual at the immutable V1 10% APR, `repay`, and debt-free close
  - single-executor delegation (`setExecutor`), cleared on real ownership transfer
  - one-way `reduceExposure` — sells exact recorded stock, pays interest then principal, surplus to the owner
  - permissionless `liquidate` — LIVE + equity strictly below 30% maintenance; surplus to owner or
    `BadDebtRealized` on shortfall; burns the Position NFT
  - minimal public risk/read surface — `riskSnapshot(tokenId)` returns LIVE-only `nav`, `currentDebt`,
    and `liquidatable` using the same predicate as `liquidate`; ownership, `positions`, `currentDebt`,
    and `CreditPool.availableCredit()` remain the authoritative oracle-independent reads
  - treasury idle withdrawal on `CreditPool` — immutable `treasury` may withdraw idle USDC only; does
    not touch borrowed capital, Position NFT state, or user debt
  - Base mainnet deploy + acceptance (issue #429) — **legacy NVDA-only deployment** on Base
    (`chainid` 8453). Historical evidence: `contracts/deployments/base-nvda-only.legacy.json`.
    All four contracts are source-verified on Basescan (solc 0.8.29, 1M optimizer runs).
    Do not redeploy from current HEAD. Do not point the frontend at these addresses after launch.
  - Multi-stock launch architecture (issue #446) — **live on Base** (`chainid` 8453).
    Append-only curated asset registry on `MarginCall` with immutable `ASSET_ADMIN`; each
    Position permanently records one `assetId`; launch rails NVDAc + AAPLc + METAc + GOOGLc
    (TSLAc excluded for zero Uniswap liquidity; METAc replaced it). Shared 100 bps execution
    bound reused. Future curated assets can be appended without redeploying `MarginCall` or
    `CreditPool`. Curated addresses and tx evidence: `contracts/deployments/base.json`.
    Scripts/runbook: `script/BASE_LAUNCH.md`. Dry-run wrappers remain available; live wrappers
    stay gated behind `CONFIRM_BASE_MAINNET=I_UNDERSTAND`. All ten contracts are source-verified
    on Basescan (solc 0.8.29, 1M optimizer runs). Minimal browser workspace (issue #448)
    consumes this deployment via `src/lib/protocol/` — not a production frontend.
  - Living Position NFT (issue #461) — **requires a coordinator redeploy before it is live on Base.**
    `openPosition` takes an optional immutable thesis (max 280 UTF-8 bytes) stored in
    `thesisOf[tokenId]`, which outlives close and liquidation; `tokenURI` is the fixed
    `https://margincall.fun/api/nft/{tokenId}` and still reverts once the NFT is burned. That route
    reads canonical Base and returns the thesis plus a static PNG already committed under `public/`
    — no IPFS, no image generation. Artwork stage comes from a pure resolver
    (`src/lib/positions/artwork.ts`) on LIVE equity ratio; live health renders only on
    `/position/[tokenId]`, while list pages stay Convex identity/lifecycle with neutral ticker logos.
    Cutover runbook: `script/BASE_LAUNCH.md` — redeploy `MarginCall` + `CreditPool` only, reusing
    the curated adapters in `base.json`, then reset the Convex read model.

  Still future work: polished product UI layered on the same `contracts/deployments/base.json` path.
  RPC-dependent tests stay in `contracts/fork/` under the `base-mainnet` profile.

  Keep each slice in step with the docstring of the contract that owns it (`MarginCall.sol` for the
  position lifecycle, `CreditPool.sol` for credit and treasury) — the list and those docstrings are the
  same statement of landed vs. future capability, so the two drifting apart is a review signal.

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
