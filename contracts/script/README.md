# Local signer smoke tests (Anvil only)

These harnesses prove Position NFT flows from an ordinary private-key EOA. They
do **not** use a frontend, Privy, Dynamic, Convex, impersonation, or any live
chain.

**Local Anvil only.** Each Solidity script reverts unless `block.chainid == 31337`.
Do not weaken this guard for mainnet work.

Base mainnet deploy + acceptance (issue #429) lives in [BASE_MAINNET.md](./BASE_MAINNET.md)
and hard-requires `block.chainid == 8453`.

Never commit, hardcode, log, or paste a private key into source. Supply it only
at runtime through `MARGIN_CALL_PRIVATE_KEY`. Do not pass the key as a
command-line argument, and do not put it inline in `export ...=<key>` (both enter
shell history). For local use, paste a **disposable Anvil development key** into
a silent prompt.

## Shared setup

1. Start Anvil (leave it running):

   ```sh
   anvil
   ```

2. Copy **disposable Anvil development keys** from Anvil's startup output.
   Do not use a live wallet. Spot and financed debt harnesses need one key;
   the executor-transfer harness needs three (Alice, executor, Bob).

3. In a second terminal, prompt silently for the key(s):

   ```sh
   read -rsp "Disposable Anvil private key (Alice): " MARGIN_CALL_PRIVATE_KEY
   echo
   export MARGIN_CALL_PRIVATE_KEY
   ```

   If `MARGIN_CALL_PRIVATE_KEY` is already set (non-interactive use), skip the
   prompt. For the executor-transfer harness, also export
   `MARGIN_CALL_EXECUTOR_KEY` and `MARGIN_CALL_RECIPIENT_KEY` the same way.

## Spot open → close

From `contracts/`: `./script/run-local.sh`  
From repo root: `pnpm test:contracts:smoke`

Deploys local tokens + production `MarginCall` / adapters, then:

`mint` → `approve` → `openPosition(1.0x)` → `closePosition`

Optional:

```sh
export MARGIN_CALL_STOCK_AMOUNT=100000000
```

Broadcast artifact:

```text
contracts/broadcast/SpotPositionLifecycle.s.sol/31337/run-latest.json
```

## Financed open → accrue → repay → close

From `contracts/`: `./script/run-financed-local.sh`  
From repo root: `pnpm test:contracts:smoke:financed`

Deploys mock NVDAc/USDC, a controllable oracle/router, production
`OracleAdapter`-compatible mock, `ExecutionAdapter`, `CreditPool`, and
`MarginCall`, funds the pool, then:

`approve` → `openPosition(financed preset)` → advance node clock → `repay` →
`closePosition` → verify

This runs as three phases against one node, and the split is load-bearing.
`forge script --broadcast` simulates the whole script body locally and only
then sends the recorded transactions, so an in-script `vm.warp` moves the
simulation and never the node — a single-phase harness would broadcast the open
and the repay into the same on-chain instant, accrue nothing, and still print a
pass. Instead the wrapper advances Anvil itself between broadcasts:

1. `deployAndOpen()` — deploys the stack, seeds the pool, opens the financed
   position, and records addresses to `deployments/financed-local.run.json`.
2. `cast rpc evm_increaseTime` + `evm_mine` — moves the real node clock, and the
   wrapper aborts if the timestamp did not actually advance.
3. `repayAndClose()` — forks a node whose clock genuinely moved, reads the real
   `currentDebt`, reverts with `NoAccrualOnNode` if no interest accrued, then
   repays with an oversized USDC cap and closes.
4. `verify()` — read-only pass over the settled node. Asserts the pool is
   strictly richer than it was seeded, which holds only if real interest
   accrued on-chain and was actually repaid.

Optional:

```sh
export MARGIN_CALL_STOCK_AMOUNT=100000000
export MARGIN_CALL_LEVERAGE_BPS=12500     # 11000 | 12500 | 14000 | 15000
export MARGIN_CALL_ACCRUAL_WINDOW=2592000 # seconds of node time to advance (default 30 days)
```

The harness prints token id, contributed/purchased NVDAc, borrowed USDC, the
node timestamp jump, debt read from the node, interest returned to the pool,
and post-close custody. Default leverage is `1.25x` (`12500`).

Broadcast artifacts:

```text
contracts/broadcast/FinancedPositionOpen.s.sol/31337/deployAndOpen-latest.json
contracts/broadcast/FinancedPositionOpen.s.sol/31337/repayAndClose-latest.json
```

## Financed A → E → B executor transfer

From `contracts/`: `./script/run-executor-transfer-local.sh`  
From repo root: `pnpm test:contracts:smoke:executor-transfer`

Requires three disposable Anvil keys:

```sh
read -rsp "Alice Anvil key: " MARGIN_CALL_PRIVATE_KEY
echo
export MARGIN_CALL_PRIVATE_KEY
read -rsp "Executor Anvil key: " MARGIN_CALL_EXECUTOR_KEY
echo
export MARGIN_CALL_EXECUTOR_KEY
read -rsp "Bob Anvil key: " MARGIN_CALL_RECIPIENT_KEY
echo
export MARGIN_CALL_RECIPIENT_KEY
```

Deploys the same mock stack as the financed debt harness, then:

`openPosition(financed)` → advance node clock → A `setExecutor(E)` → E partial
`repay` → E small `reduceExposure` → A `safeTransferFrom` to B → prove A/E lose
authority → B repays

Phases — numbered to match the script's own `phase N/6` log lines:

1. `deployAndOpen()` — Alice deploys, seeds the pool, opens financed, records
   state to `deployments/executor-transfer-local.run.json`.
   - Between phases 1 and 2 the wrapper advances the Anvil clock
     (`evm_increaseTime` + `evm_mine`). It is not a script phase and carries no
     phase number.
2. `appointAndRepay()` — Alice appoints E; E partially repays.
3. `executorReduceExposure()` — E sells a small fraction of recorded NVDAc
   (`minOut = 0`, protocol floor binds); surplus (if any) goes to Alice.
4. `transferToBob()` — reads settled post-reduce accounting from the node, Alice
   transfers the NFT to Bob, asserts stock/debt fields survive and executor clears.
5. `proveAuthorityLost()` — simulation-only: Alice and E `repay` /
   `reduceExposure` / `setExecutor` must revert.
6. `bobRepayAndVerify()` — Bob repays remaining debt on the node and verifies
   ownership/accounting.

Optional env vars match the financed harness (`MARGIN_CALL_STOCK_AMOUNT`,
`MARGIN_CALL_LEVERAGE_BPS`, `MARGIN_CALL_ACCRUAL_WINDOW`).
`MARGIN_CALL_RPC_URL` overrides the default `http://127.0.0.1:8545`.

Broadcast artifacts:

```text
contracts/broadcast/FinancedExecutorTransfer.s.sol/31337/deployAndOpen-latest.json
contracts/broadcast/FinancedExecutorTransfer.s.sol/31337/appointAndRepay-latest.json
contracts/broadcast/FinancedExecutorTransfer.s.sol/31337/executorReduceExposure-latest.json
contracts/broadcast/FinancedExecutorTransfer.s.sol/31337/transferToBob-latest.json
contracts/broadcast/FinancedExecutorTransfer.s.sol/31337/bobRepayAndVerify-latest.json
```

## Environment

| Variable                     | Required               | Purpose                                                                     |
| ---------------------------- | ---------------------- | --------------------------------------------------------------------------- |
| `MARGIN_CALL_PRIVATE_KEY`    | yes                    | Alice / primary disposable Anvil account private key. Never a live key.     |
| `MARGIN_CALL_EXECUTOR_KEY`   | executor-transfer only | Executor disposable Anvil key.                                              |
| `MARGIN_CALL_RECIPIENT_KEY`  | executor-transfer only | Bob (recipient) disposable Anvil key.                                       |
| `MARGIN_CALL_RPC_URL`        | no                     | Anvil RPC URL. Default `http://127.0.0.1:8545`.                             |
| `MARGIN_CALL_STOCK_AMOUNT`   | no                     | Raw NVDAc units to open. Default `100000000`.                               |
| `MARGIN_CALL_LEVERAGE_BPS`   | no                     | Financed harnesses. `11000` / `12500` / `14000` / `15000`. Default `12500`. |
| `MARGIN_CALL_ACCRUAL_WINDOW` | no                     | Seconds to advance the Anvil clock. Default `2592000` (30 days).            |

`broadcast/` is gitignored. Do not commit these files. Stop Anvil with Ctrl+C
when finished and discard the local key/session.

For Base mainnet deploy + acceptance, see [BASE_MAINNET.md](./BASE_MAINNET.md)
(`OPERATOR_PRIVATE_KEY` / `EXECUTOR_PRIVATE_KEY` / `RECIPIENT_PRIVATE_KEY`).
