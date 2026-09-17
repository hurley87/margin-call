# Base mainnet deploy and acceptance (issue #429)

This is the **deployment + live acceptance** path for Margin Call V1 on **Base mainnet only** (`chainid == 8453`).

It is **not** the Anvil smoke harness. Local Anvil scripts stay on `31337` and are documented in [README.md](./README.md).

Base Sepolia is not an acceptance network for V1.

## What this proves

1. Deploy the exact contracts we tested (`OracleAdapter`, `ExecutionAdapter`, `MarginCall`, `CreditPool`) with #420 / `V1Config` pins.
2. Wire `setCreditPool` once and check immutable relationships.
3. Seed a small real USDC credit pool, smoke treasury idle withdraw, then run one tiny **A → E → B** financed flow.

Liquidation / shortfall / `HELD` / shared-custody / empty-pool / interest-timing stay in Foundry suites — they are not recreated with live capital.

## Wallets you control

A, E, and B **must be three different addresses**. Deployer and treasury are the same wallet as Alice.

Put keys in gitignored `contracts/.env` (or export them). Hex with or without `0x` is fine — wrappers normalize for forge. **Never commit keys. Never pass keys as CLI args. Wrappers never print keys.**

| Env var                 | Role                                                         | Needs gas ETH?          | Also needs                   |
| ----------------------- | ------------------------------------------------------------ | ----------------------- | ---------------------------- |
| `OPERATOR_PRIVATE_KEY`  | Alice (A) + deployer (`INITIALIZER`) + `CreditPool.treasury` | **Yes** (most txs)      | ~0.01 NVDAc + ~$20 USDC seed |
| `EXECUTOR_PRIVATE_KEY`  | Executor E (`reduceExposure` only)                           | **Yes** (one tx)        | Nothing else                 |
| `RECIPIENT_PRIVATE_KEY` | Bob (B) — inherit, repay, close                              | **Yes** (repay + close) | ~$2 USDC to repay            |

Non-wallet env:

| Env var                         | Purpose                                                                |
| ------------------------------- | ---------------------------------------------------------------------- |
| `BASE_MAINNET_RPC_URL`          | Base mainnet RPC (dry-run fork + live)                                 |
| `ETHERSCAN_API_KEY`             | Basescan/Etherscan verify after live deploy (optional but recommended) |
| `CONFIRM_BASE_MAINNET`          | Must be exactly `I_UNDERSTAND` for live broadcast wrappers             |
| `MARGIN_CALL_DRY_RUN`           | Set to `1` by dry wrappers only; live wrappers refuse if set           |
| `MARGIN_CALL_STOCK_AMOUNT`      | Raw NVDAc units (default `1000000` = 0.01)                             |
| `MARGIN_CALL_LEVERAGE_BPS`      | Financed preset (default `12500` = 1.25x)                              |
| `MARGIN_CALL_CREDIT_SEED`       | USDC raw seed (default `20000000` = $20)                               |
| `MARGIN_CALL_TREASURY_WITHDRAW` | Idle USDC withdraw smoke (default `1000000` = $1)                      |

## Commands

From repo root (dry-run only is wired to pnpm):

```sh
pnpm contracts:preflight:base          # addresses + balances; never prints keys
pnpm contracts:deploy:base:dry         # DeployV1 on current Base fork, no broadcast
pnpm contracts:accept:base:dry         # full A→E→B simulation on current Base fork
```

Live (explicit shell + confirm; **not** exposed as ungated pnpm scripts):

```sh
# 1. Fund wallets, then:
./contracts/script/preflight-base-mainnet.sh

# 2. Release checks (before broadcast):
pnpm test:contracts
pnpm test:contracts:fork               # needs BASE_MAINNET_RPC_URL

# 3. Deploy (source-verify if ETHERSCAN_API_KEY is set):
CONFIRM_BASE_MAINNET=I_UNDERSTAND ./contracts/script/run-deploy-base-live.sh

# 4. Acceptance:
CONFIRM_BASE_MAINNET=I_UNDERSTAND ./contracts/script/run-accept-base-live.sh
```

Dry-run forks **latest** Base (not the pinned #420 block). Oracle `MAX_LIVE_AGE` is 8 hours, so the pin cannot be `LIVE`. The pinned fork suite remains the release gate via `pnpm test:contracts:fork`.

**Accept scripts require Base Foundry (`base-forge`)** for native B20 / NVDAc simulation — same pin as the fork suite (`base-foundryup -i v1.1.1`). Deploy dry-run can use stock `forge`.

If the oracle is `HELD` / `INVALID` during live acceptance, **wait** for a qualifying `LIVE` observation. Do not weaken policy.

## Artifacts

| Path                               | Git                    | Contents                                                   |
| ---------------------------------- | ---------------------- | ---------------------------------------------------------- |
| `deployments/base-deploy.run.json` | ignored (`*.run.json`) | Raw deploy addresses from `DeployV1`                       |
| `deployments/base-accept.run.json` | ignored                | Acceptance phase state / tokenId                           |
| `deployments/base.example.json`    | committed              | Schema for curated mainnet manifest                        |
| `deployments/base.json`            | committed after live   | Curated addresses, config, commit, tx hashes — **no keys** |

After a successful live run, merge run records + broadcast tx hashes into `deployments/base.json` by hand (see example).

## Live acceptance phases

1. Confirm oracle `LIVE`; seed CreditPool; treasury `withdraw` smoke.
2. A `openPosition` (tiny financed).
3. A `setExecutor(E)`.
4. E small `reduceExposure` (`minOut = 0`, protocol floor binds).
5. A `safeTransferFrom` → B; stock/debt survive; executor cleared.
6. Simulation-only: A/E `repay` / `reduceExposure` / `setExecutor` revert.
7. B `repay` remaining debt to zero.
8. B `closePosition`; receives remaining NVDAc; NFT burned.

No executor repay on mainnet (E would need USDC). Interest-timing proofs stay in Foundry tests.

## Live evidence (2026-09-17)

Curated manifest: [`../deployments/base.json`](../deployments/base.json).

| Contract         | Address                                      |
| ---------------- | -------------------------------------------- |
| OracleAdapter    | `0x250C91ffAc5ed9E71d4efDe84261971324f8EbD9` |
| ExecutionAdapter | `0xc85f9E75a693D9186924Bd3afB17F432c38fEe73` |
| MarginCall       | `0xe00D890a03eefE847Ef73f4f8c98311ef3E1d35d` |
| CreditPool       | `0x700FEAA4dEcb6430d50c573AE572674433d206E7` |

Acceptance: tokenId `1`, A→E→B financed flow completed (seed, treasury withdraw, open, setExecutor, reduceExposure, transfer, repay, close). Source verify pending `ETHERSCAN_API_KEY`.
