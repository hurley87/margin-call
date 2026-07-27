# Contract build reproducibility

Pinned compiler, chain-state, and dependency settings for the contract
workspace. A clean clone with these pins should produce identical bytecode when
built with the same Foundry version.

The configuration follows [LazerForge](https://github.com/LazerTechnologies/LazerForge)
(`minimal` branch) conventions, adapted to this repository rather than imported
wholesale. Deviations are listed at the bottom of this file.

## Toolchain

| Component         | Pin                        | Where                                                                                                        |
| ----------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Foundry (forge)   | `v1.4.3`                   | [`.github/actions/setup-foundry/action.yml`](../.github/actions/setup-foundry/action.yml), local `foundryup` |
| Solidity (`solc`) | `0.8.28`, auto-detect off  | [`foundry.toml`](foundry.toml) `solc_version`, `auto_detect_solc`                                            |
| EVM target        | `cancun`                   | [`foundry.toml`](foundry.toml) `evm_version`                                                                 |
| Optimizer         | enabled, `99_999_999` runs | [`foundry.toml`](foundry.toml)                                                                               |
| Metadata          | stripped                   | [`foundry.toml`](foundry.toml) `bytecode_hash = "none"`, `cbor_metadata = false`                             |

## Deterministic chain state

Tests run against a fixed, realistic chain state instead of block 1:

| Setting           | Value           | Source                                                    |
| ----------------- | --------------- | --------------------------------------------------------- |
| `block_number`    | `93_499_334`    | Robinhood Chain testnet (46630) head, observed 2026-07-26 |
| `block_timestamp` | `1_785_024_629` | Timestamp of that block (2026-07-26T00:10:29Z)            |

Update both together, and only to a matching real block, so time-dependent
tests stay honest about the network they target.

## Profiles

| Profile   | Purpose                | Notable settings                   |
| --------- | ---------------------- | ---------------------------------- |
| `default` | Fast local development | fuzz 256, invariant 64 × 32        |
| `ci`      | Complete suite         | fuzz 512, invariant 128 × 32       |
| `ci-fuzz` | Higher-run campaign    | fuzz 1024, invariant 256 × 64      |
| `gas`     | Gas analysis/snapshots | `via_ir`, optimizer 1,000,000 runs |

```bash
forge test                                        # default
FOUNDRY_PROFILE=ci forge test                     # CI suite
FOUNDRY_PROFILE=ci-fuzz forge test                # fuzz/invariant campaign
FOUNDRY_PROFILE=gas forge snapshot                # gas analysis
```

RPC endpoints come from the environment (`ROBINHOOD_TESTNET_RPC_URL`) via
`[rpc_endpoints]`; no URL is hard-coded.

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

Contract source pragmas remain `^0.8.20`; `foundry.toml` forces solc `0.8.28`
for every build.

## Documented deviations from LazerForge

- **Dependencies via `foundry.deps.json` + `forge install --no-git`**, not git
  submodules. Keeps `lib/` out of the repo's submodule machinery; the manifest
  is the lock.
- **Remappings** cover only the dependencies this repo installs. LazerForge
  ships Solady remappings that would not resolve here (no Solady).
- **`evm_version = "cancun"`** rather than LazerForge's `prague`. Robinhood
  Chain testnet is an Arbitrum Nitro L2; Cancun is the pin this workspace
  targets.
- **No `via_ir-out` pre-compile step.** LazerForge pre-compiles via-IR and
  deploys with `vm.getCode`. Contracts here fit without it, so via-IR is
  confined to the `gas` profile.
- **No `legacy` profile.** The Base Sepolia deal-game path is gone; only the
  Robinhood testnet profiles remain.
- **Named profiles `ci` / `ci-fuzz`** (kebab) in addition to LazerForge's
  uppercase `CI.fuzz` — matches the prior Floor conventions already used by
  this repo's CI job (`FOUNDRY_PROFILE=ci`).
