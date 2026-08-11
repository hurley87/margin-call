# Contract build reproducibility

The retained Foundry workspace pins its toolchain and dependencies so future Crash contracts begin from a reproducible baseline.

| Component  | Pin                            |
| ---------- | ------------------------------ |
| Foundry    | `v1.4.3`                       |
| Solidity   | `0.8.29`, auto-detect disabled |
| EVM target | `cancun`                       |
| Optimizer  | enabled, `1,000,000` runs      |
| Metadata   | stripped                       |

Forge dependency versions live in [`foundry.deps.json`](foundry.deps.json) and install through `pnpm install:forge-deps`. The gitignored `lib/` directory is reconstructable from that manifest.

Inco Lightning is installed from the workspace lockfile as the exact npm package `@inco/lightning@1.0.2`. Foundry resolves `@inco/` through the root `node_modules`, so run `pnpm install --frozen-lockfile` before contract checks. Inco's Safe dependency is overridden to the equivalent published `@safe-global/safe-smart-account@1.5.0` package because the upstream manifest references GitHub over SSH, which is not reproducible on unauthenticated CI and Vercel builders.

Inco Lightning requires Solidity 0.8.29 and OpenZeppelin Contracts 5.4.0; both the regular and upgradeable OpenZeppelin packages are pinned in `foundry.deps.json` so the Solidity build does not depend on pnpm's transitive layout. Live contract addresses, immutable launch configuration, source commit, and transaction provenance are recorded in [`deployments/base_sepolia.json`](deployments/base_sepolia.json).
