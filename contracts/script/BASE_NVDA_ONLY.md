# Historical NVDA-only Base deployment (issue #429)

**Archive.** This documents the 2026-09-17 NVDA-only Base deployment. It is **not**
the current deployment path.

The canonical launch stack is the multi-stock architecture (NVDAc + AAPLc + METAc + GOOGLc).
See [BASE_LAUNCH.md](./BASE_LAUNCH.md). Current HEAD cannot reproduce this historical
deployment: `DeployV1` / `AcceptV1` have been removed so they cannot be mistaken for a
supported launch path while compiling the launch contracts.

Evidence is frozen at
[`../deployments/base-nvda-only.legacy.json`](../deployments/base-nvda-only.legacy.json).
Do not overwrite it. Do not point the product frontend at these addresses after launch.

## What was deployed

Four contracts on Base mainnet (`chainid == 8453`), NVDA rails only:

| Contract         | Address                                      |
| ---------------- | -------------------------------------------- |
| OracleAdapter    | `0x250C91ffAc5ed9E71d4efDe84261971324f8EbD9` |
| ExecutionAdapter | `0xc85f9E75a693D9186924Bd3afB17F432c38fEe73` |
| MarginCall       | `0xe00D890a03eefE847Ef73f4f8c98311ef3E1d35d` |
| CreditPool       | `0x700FEAA4dEcb6430d50c573AE572674433d206E7` |

- `sourceCommit`: `2cbb8eb36d0c67e509f429c5f5a62ab25721fc41`
- Deployer / treasury: `0xBe523e724B9Ea7D618dD093f14618D90c4B19b0c`
- Acceptance: tokenId `1`, A→E→B financed flow completed 2026-09-17 (seed, treasury withdraw, open, setExecutor, reduceExposure, transfer, repay, close). Tx hashes are in the legacy manifest.
- Source verification: all four contracts verified on Basescan (solc `v0.8.29+commit.ab55807c`, 1,000,000 optimizer runs). `bytecode_hash = "none"` keeps the build reproducible.

## What this path proved at the time

1. Deploy `OracleAdapter`, `ExecutionAdapter`, `MarginCall`, and `CreditPool` with #420 / `V1Config` pins.
2. Wire `setCreditPool` once and check immutable relationships.
3. Seed a small real USDC credit pool, smoke treasury idle withdraw, then run one tiny **A → E → B** financed flow.

Those executable scripts are retired. Recreating the 2026-09-17 bytecode requires checking out `sourceCommit`, not running current HEAD.

## Safety model retained for launch

The launch wrappers keep the same private-key rules this path established:

- never commit keys
- never print keys
- never pass private keys as CLI arguments
- prefer hidden terminal prompt → shell-local environment variable → forge script
- require `CONFIRM_BASE_MAINNET=I_UNDERSTAND` before broadcast
- print addresses and planned actions, never secrets
- preflight before broadcast
