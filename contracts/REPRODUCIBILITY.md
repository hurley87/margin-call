# Contract build reproducibility

Pinned compiler and dependency settings for `MarginCallEscrow`, `SeatVault`, and
`MarginCallToken`. A clean clone with these pins should produce identical bytecode
when built with the same Foundry version.

## Toolchain

| Component         | Pin                 | Where                                                                                                        |
| ----------------- | ------------------- | ------------------------------------------------------------------------------------------------------------ |
| Foundry (forge)   | `v1.4.3`            | [`.github/actions/setup-foundry/action.yml`](../.github/actions/setup-foundry/action.yml), local `foundryup` |
| Solidity (`solc`) | `0.8.28`            | [`foundry.toml`](foundry.toml) `solc_version`                                                                |
| EVM target        | `cancun`            | [`foundry.toml`](foundry.toml) `evm_version`                                                                 |
| Optimizer         | enabled, `200` runs | [`foundry.toml`](foundry.toml)                                                                               |

## Forge libraries

Versions live in [`foundry.deps.json`](foundry.deps.json). Install with:

```bash
pnpm install:forge-deps
# or: bash scripts/install-forge-deps.sh
```

| Library                | Tag      |
| ---------------------- | -------- |
| forge-std              | `v1.9.4` |
| openzeppelin-contracts | `v5.2.0` |

`lib/` is gitignored; the manifest + install script are the lock.

## Verify locally

```bash
pnpm install:forge-deps
cd contracts && forge build
# Compare bytecode hashes under out/*.sol/*.json "deployedBytecode.object"
```

Contract source pragmas remain `^0.8.20`; `foundry.toml` forces solc `0.8.28` for every build.
