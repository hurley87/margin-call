# CLAUDE.md

## Project overview

Margin Call is between product versions. The Crash game has been retired from this repository. The site is a coming-soon landing page with no login. Stack scaffolding remains for the next build:

- `CONTEXT.md` — product glossary
- Privy and Convex scaffolding only — no frontend product yet
- `contracts/` has started landing product contracts, one scoped slice at a time

Do not infer that the frontend is already implemented, or that a contract slice covers more than it says. Add
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

- `src/` — neutral Next.js shell, styling, authentication helpers, and UI primitives
- `convex/` — Convex auth and HTTP infrastructure
- `packages/shared/` — framework-neutral validation helpers
- `contracts/` — Foundry workspace. `src/MarginCall.sol` is the Position NFT coordinator (NVDAc custody +
  ERC-721 ownership), supported by `CreditPool.sol`, `OracleAdapter.sol`, `OracleStatePolicy.sol`,
  `ExecutionAdapter.sol`, and the immutable `V1Config.sol` presets. Landed slices, in order:
  - spot-only open and close (`openPosition` at 1.0x, `closePosition`)
  - financed open against protocol credit (Uniswap-only execution, `LIVE` pricing required)
  - lazy debt accrual at the immutable V1 10% APR, `repay`, and debt-free close
  - single-executor delegation (`setExecutor`), cleared on real ownership transfer
  - one-way `reduceExposure` — sells exact NVDAc, pays interest then principal, surplus to the owner
  - permissionless `liquidate` — LIVE + equity strictly below 30% maintenance; surplus to owner or
    `BadDebtRealized` on shortfall; burns the Position NFT
  - minimal public risk/read surface — `riskSnapshot(tokenId)` returns LIVE-only `nav`, `currentDebt`,
    and `liquidatable` using the same predicate as `liquidate`; ownership, `positions`, `currentDebt`,
    and `CreditPool.availableCredit()` remain the authoritative oracle-independent reads
  - treasury idle withdrawal on `CreditPool` — immutable `treasury` may withdraw idle USDC only; does
    not touch borrowed capital, Position NFT state, or user debt

  Still future work: the living NFT presentation (`tokenURI` is minimal identity metadata only).
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
