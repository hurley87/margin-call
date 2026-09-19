![Margin Call](public/banner.png)

# Margin Call

**Margin Call is a financing protocol for tokenized stocks. It finances real onchain spot exposure and makes the financed position transferable.**

```text
tokenized stock
      +
protocol financing
      ↓
financed spot position
      ↓
transferable Position NFT
```

Margin Call lets a user contribute real tokenized stock, use protocol capital to increase the position's spot exposure, and receive an ERC-721 representing the resulting stock + debt position. Unlike a perp, the position is backed by actual tokenized stock held in protocol custody. Unlike a traditional margin account, the financed position itself is programmable and transferable.

## How it works

- `MarginCall` itself is the ERC-721 Position NFT contract; there is no separate PositionNFT contract.
- The contract directly custodies the position's real tokenized stock.
- Financed openings draw protocol-owned USDC only to buy more of that same stock; borrowed USDC is never freely withdrawable.
- Transferring the NFT transfers control of the existing stock + debt position without unwinding or resetting it.
- Transfer clears the old executor.
- Repay and reduce exposure can pay debt down; debt-free positions can close and return the remaining stock.
- Liquidation is permissionless under LIVE pricing and has no liquidator reward in V1.
- V1 proves transferable financed positions; it does **not** claim a completed secondary marketplace.

## Canonical launch

The live Base mainnet stack is a curated multi-stock launch:

- Base mainnet (`chainid` 8453)
- Long-only
- Launch rails: **NVDAc + AAPLc + METAc + GOOGLc**
- Spot `1.0x` plus financed `1.1x`, `1.25x`, `1.4x`, and `1.5x` opening presets
- Protocol-owned USDC financing
- Real stock custody inside `MarginCall`
- Uniswap V3 execution
- Coinbase / Chainlink total-return pricing for solvency
- Transferable Position NFTs with debt and stock accounting preserved across transfer
- One optional executor per position
- Deployed, live-accepted, and source-verified on Base

Canonical addresses and compact live-acceptance evidence: [`contracts/deployments/base.json`](contracts/deployments/base.json).  
Deploy / acceptance runbook: [`contracts/script/BASE_LAUNCH.md`](contracts/script/BASE_LAUNCH.md).

Core contracts:

- [`contracts/src/MarginCall.sol`](contracts/src/MarginCall.sol)
- [`contracts/src/CreditPool.sol`](contracts/src/CreditPool.sol)
- [`contracts/src/OracleAdapter.sol`](contracts/src/OracleAdapter.sol)
- [`contracts/src/ExecutionAdapter.sol`](contracts/src/ExecutionAdapter.sol)

The 2026-09-17 NVDA-only Base deployment (issue #429) is a frozen legacy milestone, not the product target. Evidence: [`contracts/deployments/base-nvda-only.legacy.json`](contracts/deployments/base-nvda-only.legacy.json).

## Runtime positioning

Margin Call is a financing primitive for tokenized stocks. It uses protocol capital to increase real spot exposure, and represents the resulting stock + debt position as a transferable Position NFT.

Agent tooling can operate on top of the protocol, but it is not the product definition. Margin Call is not an AI trading bot.

## App and agent status

| Layer                                                            | Status                                                                                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Multi-stock contracts + compact live acceptance                  | **Shipped** on Base                                                                                                     |
| Dynamic wallet foundation                                        | **Shipped** for the workspace                                                                                           |
| Minimal Base Position workspace (connect → open → repay → close) | **Shipped** — not the production frontend                                                                               |
| Executor / reduce-exposure / liquidate UI                        | Planned                                                                                                                 |
| Production frontend, indexing, keeper automation                 | Planned                                                                                                                 |
| Public agent API + MCP (read, quote, prepare)                    | **Shipped** ([#491](https://github.com/hurley87/margin-call/issues/491)) — see [`docs/agent-api.md`](docs/agent-api.md) |
| Living NFT presentation (`tokenURI`)                             | **Shipped** on Base ([#461](https://github.com/hurley87/margin-call/issues/461)) — HTTPS metadata + on-chain thesis     |
| Convex JWT / identity                                            | Not wired yet (empty schema + HTTP router)                                                                              |

The website is a visual/wallet control plane, not a conversational chatbot. Users may interact with a Margin Call agent outside the website — the unauthenticated agent surface at `/api/agent/*` and `/api/mcp` exposes the same Base reads, quotes, and unsigned open calldata the site uses, and works with any wallet. The user owns the Position NFT; executor / delegated authority stays narrow and revocable on-chain.

## What's in the repo today

| Area               | State                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `src/`             | Next.js 16 shell (Base workspace + Dynamic wallet), protocol helpers, UI primitives      |
| `convex/`          | Empty HTTP router and schema; no JWT auth until a product feature needs identity         |
| `packages/shared/` | Framework-neutral validation helpers                                                     |
| `contracts/`       | Foundry workspace: canonical multi-stock launch contracts — see [`AGENTS.md`](AGENTS.md) |

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 · Convex · Dynamic · Foundry · viem

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Copy `.env.example` to `.env.local` for the required environment variables.

### Dynamic dashboard

For local wallet connect:

1. Create an environment in the [Dynamic console](https://console.dynamic.xyz/dashboard/developer/api) and set `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID`.
2. Enable **external EVM wallets** and **Base (8453)**.
3. Allowlist `http://localhost:3000` (and production origin).
4. Prefer **in-app** auth token storage (needed later for any Convex JWT bridge).

`NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` is read at build time. Without it, the page still renders a configure-Dynamic message and the Connect chunk is omitted from the build. **Switch to Base** prompts the wallet to add Base (8453) when it is not already present.

Optional: set `NEXT_PUBLIC_BASE_RPC_URL` for public Base reads (defaults to `https://mainnet.base.org`).

`src/lib/dynamic/wallet-client.ts` exposes a Base (8453) viem `WalletClient` from a connected Dynamic EVM wallet. `src/lib/protocol/` loads addresses from `contracts/deployments/base.json` and encodes open / repay / close.

## Commands

| Command                          | Description                                         |
| -------------------------------- | --------------------------------------------------- |
| `pnpm dev`                       | Start dev server (Next.js on localhost:3000)        |
| `pnpm build`                     | Production build                                    |
| `pnpm lint`                      | Run ESLint                                          |
| `pnpm typecheck`                 | TypeScript check                                    |
| `pnpm test`                      | Vitest unit tests                                   |
| `pnpm install:forge-deps`        | Install gitignored Foundry libraries                |
| `pnpm test:contracts`            | Foundry workspace checks                            |
| `pnpm test:contracts:ci`         | Foundry CI profile checks                           |
| `pnpm test:contracts:fork`       | Base mainnet fork checks (RPC required)             |
| `pnpm test:contracts:smoke`      | Local Anvil signer smoke harness                    |
| `pnpm contracts:preflight:base`  | Base deploy preflight (balances; never prints keys) |
| `pnpm contracts:deploy:base:dry` | Dry-run deploy on a current Base fork               |
| `pnpm contracts:accept:base:dry` | Dry-run compact acceptance on a current Base fork   |

## Docs

| Doc                                                                  | Role                                             |
| -------------------------------------------------------------------- | ------------------------------------------------ |
| [`CONTEXT.md`](CONTEXT.md)                                           | Product glossary                                 |
| [`docs/margin-account-prd.md`](docs/margin-account-prd.md)           | V1 behavior / acceptance spec                    |
| [`docs/README.md`](docs/README.md)                                   | Docs index and ADRs                              |
| [`contracts/README.md`](contracts/README.md)                         | Foundry workspace entry                          |
| [`contracts/script/BASE_LAUNCH.md`](contracts/script/BASE_LAUNCH.md) | Canonical Base deploy + acceptance runbook       |
| [`contracts/deployments/base.json`](contracts/deployments/base.json) | Canonical addresses and live-acceptance evidence |
