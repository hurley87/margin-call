# Local signer smoke tests (Anvil only)

These harnesses prove Position NFT flows from an ordinary private-key EOA. They
do **not** use a frontend, Privy, Dynamic, Convex, impersonation, or any live
chain.

**Local Anvil only.** Each Solidity script reverts unless `block.chainid == 31337`.
Issue #429 owns any later Base-mainnet signer/deployment flow.

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

2. Copy **one disposable Anvil development key** from Anvil's startup output.
   Do not use a live wallet.

3. In a second terminal, prompt silently for the key:

   ```sh
   read -rsp "Disposable Anvil private key: " MARGIN_CALL_PRIVATE_KEY
   echo
   export MARGIN_CALL_PRIVATE_KEY
   ```

   If `MARGIN_CALL_PRIVATE_KEY` is already set (non-interactive use), skip the
   prompt.

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

`approve` → `openPosition(financed preset)` → advance time → `repay` → `closePosition`

The harness advances time via Foundry `vm.warp` (forwarded to Anvil under
`--broadcast`) so `currentDebt > principal`, repays with an oversized USDC cap
(only current debt is pulled), restores the pool, and closes the debt-free
position.

Optional:

```sh
export MARGIN_CALL_STOCK_AMOUNT=100000000
export MARGIN_CALL_LEVERAGE_BPS=12500   # 11000 | 12500 | 14000 | 15000
```

The harness prints token id, owner, contributed/purchased NVDAc, borrowed USDC,
pool balances, debt before/after accrual and repayment, and post-close custody.
Default leverage is `1.25x` (`12500`).

Broadcast artifact:

```text
contracts/broadcast/FinancedPositionOpen.s.sol/31337/run-latest.json
```

## Environment

| Variable                   | Required | Purpose                                                                        |
| -------------------------- | -------- | ------------------------------------------------------------------------------ |
| `MARGIN_CALL_PRIVATE_KEY`  | yes      | Disposable Anvil account private key. Never a live key.                        |
| `MARGIN_CALL_STOCK_AMOUNT` | no       | Raw NVDAc units to open. Default `100000000`.                                  |
| `MARGIN_CALL_LEVERAGE_BPS` | no       | Financed harness only. `11000` / `12500` / `14000` / `15000`. Default `12500`. |

`broadcast/` is gitignored. Do not commit these files. Stop Anvil with Ctrl+C
when finished and discard the local key/session.
