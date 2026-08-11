# Contracts workspace

Foundry scaffolding for the future Margin Call Crash implementation described in:

- [`../docs/2026-08-08-margin-call-crash-technical-design.md`](../docs/2026-08-08-margin-call-crash-technical-design.md)
- [`../docs/2026-08-07-margin-call-crash-prd.md`](../docs/2026-08-07-margin-call-crash-prd.md)

The retired Pack Rip contracts, scripts, deployments, and tests have been removed. `MarginCallCrash` currently implements the fixed epoch grid, pre-committed confidential round creation, permissionless reveal, attested finalization, and expiry. Entry, tickets, vault settlement, and refunds arrive in later slices.

After deploying a replacement game contract, a Base Sepolia lifecycle smoke can be run with:

```bash
pnpm smoke:crash-lifecycle
# or, for an already-opened unresolved round after expiresAt:
# SMOKE_EXPIRE_ROUND_ID=<id> node scripts/smoke-crash-expire.mjs
```

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
```

Compiler and dependency pins are documented in [REPRODUCIBILITY.md](./REPRODUCIBILITY.md).

## Crash deployment

Choose a minute-aligned Unix timestamp at least five minutes in the future, then run the Base Sepolia deployment with the recorded release deployer:

```bash
MARGIN_CALL_EPOCH_ORIGIN=<timestamp> \
forge script script/DeployMarginCallCrash.s.sol:DeployMarginCallCrash \
  --rpc-url <base-sepolia-rpc> \
  --sender 0xBe523e724B9Ea7D618dD093f14618D90c4B19b0c \
  --broadcast
```

The script writes `deployments/base_sepolia.margin_call_crash.run.json` for deliberate review and merging into the curated deployment record.
