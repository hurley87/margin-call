# Base launch deploy and acceptance

This is the **canonical Base mainnet deployment path** for Margin Call (`chainid == 8453`).

It deploys the multi-stock launch contracts: one `MarginCall`, one `CreditPool`, and one
oracle/execution adapter pair for each qualified launch rail.

**Launch set:** NVDAc + AAPLc + METAc + GOOGLc.

TSLAc was evaluated and excluded: the only USDC/TSLAc Uniswap pool had zero usable liquidity,
so demo buys/sells cannot clear the shared 100 bps bound. METAc replaced it. Future curated
stocks can be appended with `addAsset` without redeploying `MarginCall` or `CreditPool`.

This is **not** the Anvil smoke harness (see [README.md](./README.md)).
This is **not** a redeploy of the historical NVDA-only stack
([BASE_NVDA_ONLY.md](./BASE_NVDA_ONLY.md), `deployments/base-nvda-only.legacy.json`).

Do **not** broadcast from this runbook in the architecture PR. Live wrappers stay gated.

## What this deploys

| Contract           | How many | Role                                                           |
| ------------------ | -------- | -------------------------------------------------------------- |
| `MarginCall`       | 1        | Position NFT coordinator + append-only asset registry          |
| `CreditPool`       | 1        | Shared USDC credit; immutable borrower is the new `MarginCall` |
| `OracleAdapter`    | 4        | One per launch stock / feed                                    |
| `ExecutionAdapter` | 4        | One per launch stock / Uniswap fee                             |

Operator is deployer (`INITIALIZER`), `ASSET_ADMIN`, and `CreditPool.treasury`.

Rails come from `LaunchAssets.launchSet()` — do not duplicate addresses in a wrapper.

## Wallets you control

Compact launch acceptance is **operator-only**.

**How keys enter the run.** Preferred for real mainnet keys: leave them unset and let the wrapper prompt.
Each wrapper reads any missing key from the terminal with echo off and exports it **for that shell only**, so
the key never lands in shell history, a file, or a command line:

```
OPERATOR_PRIVATE_KEY (deployer / asset admin / treasury), input hidden:
```

A gitignored `contracts/.env` is still read first and is fine for throwaway or test wallets, but a key stored
there persists on disk — prefer the prompt for wallets holding real funds. Hex with or without `0x` is fine;
wrappers normalize for forge.

**Never commit keys. Never pass keys as CLI args. Wrappers never print keys.** Addresses are derived inside
forge via `vm.envUint` (see [`Actors.s.sol`](./Actors.s.sol)) rather than `cast wallet address --private-key`.

| Env var                | Role                                                             | Needs gas ETH?    | Also needs                                       |
| ---------------------- | ---------------------------------------------------------------- | ----------------- | ------------------------------------------------ |
| `OPERATOR_PRIVATE_KEY` | Deployer (`INITIALIZER`) + `ASSET_ADMIN` + `CreditPool.treasury` | **Yes** (all txs) | ~0.01 NVDAc + ~$20 USDC seed + ~$2 USDC to repay |

Non-wallet env:

| Env var                         | Purpose                                                                |
| ------------------------------- | ---------------------------------------------------------------------- |
| `BASE_MAINNET_RPC_URL`          | Base mainnet RPC (dry-run fork + live)                                 |
| `ETHERSCAN_API_KEY`             | Basescan/Etherscan verify after live deploy (optional but recommended) |
| `CONFIRM_BASE_MAINNET`          | Must be exactly `I_UNDERSTAND` for live broadcast wrappers             |
| `MARGIN_CALL_DRY_RUN`           | Set to `1` by dry wrappers only; live wrappers refuse if set           |
| `MARGIN_CALL_STOCK_AMOUNT`      | Raw stock units (default `1000000` = 0.01 of the first launch rail)    |
| `MARGIN_CALL_LEVERAGE_BPS`      | Financed preset (default `12500` = 1.25x)                              |
| `MARGIN_CALL_CREDIT_SEED`       | USDC raw seed (default `20000000` = $20)                               |
| `MARGIN_CALL_TREASURY_WITHDRAW` | Idle USDC withdraw smoke (default `1000000` = $1)                      |

## Commands

From repo root (dry-run only is wired to pnpm):

```sh
pnpm contracts:preflight:base          # operator address + balances; never prints keys
pnpm contracts:deploy:base:dry         # DeployLaunch on current Base fork, no broadcast
pnpm contracts:accept:base:dry         # deploy + financed open -> repay -> close on current Base fork
```

Live (explicit shell + confirm; **not** exposed as ungated pnpm scripts). Do not run until
this architecture has merged and a human is ready to fund wallets:

```sh
# 1. Fund the operator, then:
./contracts/script/preflight-base-mainnet.sh

# 2. Release checks (before broadcast):
pnpm test:contracts
pnpm test:contracts:fork               # needs BASE_MAINNET_RPC_URL

# 3. Deploy (source-verify if ETHERSCAN_API_KEY is set):
CONFIRM_BASE_MAINNET=I_UNDERSTAND ./contracts/script/run-deploy-base-live.sh

# 4. Compact acceptance:
CONFIRM_BASE_MAINNET=I_UNDERSTAND ./contracts/script/run-accept-base-live.sh
```

Dry-run forks **latest** Base (not the pinned qualification block). Oracle `MAX_LIVE_AGE` is 8 hours, so the pin cannot be `LIVE`. The pinned fork suite remains the release gate via `pnpm test:contracts:fork`.

**Accept scripts require Base Foundry (`base-forge`)** for native B20 simulation — same pin as the fork suite (`base-foundryup -i v1.1.1`). Deploy dry-run can use stock `forge`.

If the oracle is `HELD` / `INVALID` during live acceptance, **wait** for a qualifying `LIVE` observation. Do not weaken policy.

## Artifacts

| Path                                      | Git                    | Contents                                                                |
| ----------------------------------------- | ---------------------- | ----------------------------------------------------------------------- |
| `deployments/base-launch-deploy.run.json` | ignored (`*.run.json`) | Raw deploy addresses from `DeployLaunch`                                |
| `deployments/base-launch-accept.run.json` | ignored                | Acceptance phase state / tokenId                                        |
| `deployments/base.example.json`           | committed              | Schema for the canonical launch manifest                                |
| `deployments/base.json`                   | committed after live   | Canonical launch addresses, rails, commit, tx hashes — **no keys**      |
| `deployments/base-nvda-only.legacy.json`  | committed (historical) | Issue #429 NVDA-only evidence. Do not overwrite. Frontend must not use. |

After a successful live run, merge run records + broadcast tx hashes into `deployments/base.json`
by hand from `base.example.json`. **Never** merge into `base-nvda-only.legacy.json`.

The frontend should target only `deployments/base.json` for new positions once that file exists.

## Live acceptance phases

1. Confirm first-rail oracle `LIVE`; seed CreditPool; treasury `withdraw` smoke.
2. Operator `openPosition` (tiny financed, first launch rail = NVDAc).
3. Operator `repay` remaining debt and `closePosition`; NFT burned; stock returned.

Liquidation / shortfall / `HELD` / mixed-asset isolation stay in Foundry suites.
Executor-transfer coverage stays in the local Anvil harness and unit tests.

## Historical NVDA-only deployment

The 2026-09-17 NVDA-only Base deployment is preserved at
[`../deployments/base-nvda-only.legacy.json`](../deployments/base-nvda-only.legacy.json)
and documented in [BASE_NVDA_ONLY.md](./BASE_NVDA_ONLY.md). Current HEAD cannot reproduce it.
Do not point the product frontend at those addresses after launch.
