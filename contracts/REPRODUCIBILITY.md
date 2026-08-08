# Contract build reproducibility

The retained Foundry workspace pins its toolchain and dependencies so future Crash contracts begin from a reproducible baseline.

| Component  | Pin                            |
| ---------- | ------------------------------ |
| Foundry    | `v1.4.3`                       |
| Solidity   | `0.8.28`, auto-detect disabled |
| EVM target | `cancun`                       |
| Optimizer  | enabled, `1,000,000` runs      |
| Metadata   | stripped                       |

Forge dependency versions live in [`foundry.deps.json`](foundry.deps.json) and install through `pnpm install:forge-deps`. The gitignored `lib/` directory is reconstructable from that manifest.

No chain state, RPC endpoint, deployment address, or product contract is pinned while the Crash implementation remains future work. Those values must be added explicitly with the implementation and recorded against its target deployment.
