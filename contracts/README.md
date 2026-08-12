# Contracts workspace

Foundry workspace for the Margin Call Crash Game Jam MVP on **Base Sepolia** (`84532`). Product source of truth:

- [`../docs/2026-08-07-margin-call-crash-prd.md`](../docs/2026-08-07-margin-call-crash-prd.md)
- [`../docs/2026-08-08-margin-call-crash-technical-design.md`](../docs/2026-08-08-margin-call-crash-technical-design.md)
- [`../docs/runbooks/deploy-smoke-release.md`](../docs/runbooks/deploy-smoke-release.md)

Implemented: Desk Dollars + faucet, `BankrollVault`, `MarginCallCrash` (entry, settlement, expiry refunds, reveal-window freeze), and Base Sepolia deploy scripts. The curated release record is [`deployments/base_sepolia.json`](./deployments/base_sepolia.json).

## Prerequisites

1. Install Foundry `v1.4.3`.
2. Install repository dependencies with `pnpm install`.
3. Restore gitignored Forge libraries with `pnpm install:forge-deps`.

## Checks

```bash
pnpm install:forge-deps
cd contracts
forge fmt --check
forge build
forge test
# or from repo root:
pnpm test:contracts:ci
pnpm validate:base-sepolia-release
```

Compiler and dependency pins are documented in [REPRODUCIBILITY.md](./REPRODUCIBILITY.md).

## Fresh Base Sepolia deploy

HITL only — requires the recorded deployer key and RPC. Full order, merge rules, smoke checklist, and acceptance mapping live in the [deploy/smoke runbook](../docs/runbooks/deploy-smoke-release.md).

Summary:

1. `DeployDeskDollars` → merge `base_sepolia.run.json`
2. `DeployBankrollVault` (exact 25,000 tUSD seed) → merge `base_sepolia.bankroll_vault.run.json`
3. `DeployMarginCallCrash` with minute-aligned `MARGIN_CALL_EPOCH_ORIGIN` → merge `base_sepolia.margin_call_crash.run.json`
4. Verify on Basescan; update `sourceCommit` and validation URLs
5. Propagate addresses to Vercel / Convex; run guided Privy smoke

Crash-only redeploy (vault already seeded and unauthorized):

```bash
MARGIN_CALL_EPOCH_ORIGIN=<timestamp> \
forge script script/DeployMarginCallCrash.s.sol:DeployMarginCallCrash \
  --rpc-url <base-sepolia-rpc> \
  --sender 0xBe523e724B9Ea7D618dD093f14618D90c4B19b0c \
  --broadcast
```

Operator lifecycle smoke (funded EOA — not the fresh-phone Privy path):

```bash
pnpm smoke:crash-lifecycle
# SMOKE_EXPIRE=1 pnpm smoke:crash-lifecycle
# SMOKE_EXPIRE_ROUND_ID=<id> node scripts/smoke-crash-expire.mjs
```
