# Contracts workspace

Foundry scaffolding for the future Margin Call Crash implementation described in:

- [`../docs/2026-08-08-margin-call-crash-technical-design.md`](../docs/2026-08-08-margin-call-crash-technical-design.md)
- [`../docs/2026-08-07-margin-call-crash-prd.md`](../docs/2026-08-07-margin-call-crash-prd.md)

The retired Pack Rip contracts, scripts, deployments, and tests have been removed. No Crash product contract is implemented yet.

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
