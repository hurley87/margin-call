# Contract build reproducibility

The retained Foundry workspace pins its toolchain and dependencies so future product contracts begin from a reproducible baseline.

| Component  | Pin                            |
| ---------- | ------------------------------ |
| Foundry    | `v1.4.3`                       |
| Solidity   | `0.8.29`, auto-detect disabled |
| EVM target | `cancun`                       |
| Optimizer  | enabled, `1,000,000` runs      |
| Metadata   | stripped                       |

Forge dependency versions live in [`foundry.deps.json`](foundry.deps.json) and install through `pnpm install:forge-deps`. The gitignored `lib/` directory is reconstructable from that manifest.

OpenZeppelin Contracts (regular and upgradeable) are pinned in `foundry.deps.json` so the Solidity build does not depend on pnpm's transitive layout.
