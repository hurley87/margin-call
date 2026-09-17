# Local signer smoke test (Anvil only)

This harness proves the spot Position NFT lifecycle from an ordinary private-key
EOA. It does **not** use a frontend, Privy, Dynamic, Convex, impersonation, or
any live chain.

**Local Anvil only.** The Solidity script reverts unless `block.chainid == 31337`.
Issue #429 owns any later Base-mainnet signer/deployment flow.

Never commit, hardcode, log, or paste a private key into source. Supply it only
at runtime through `MARGIN_CALL_PRIVATE_KEY`. Do not pass the key as a
command-line argument, and do not put it inline in `export ...=<key>` (both enter
shell history). For local use, paste a **disposable Anvil development key** into
a silent prompt.

## Run locally

1. Start Anvil (leave it running):

   ```sh
   anvil
   ```

2. Copy **one disposable Anvil development key** from Anvil's startup output.
   Do not use a live wallet.

3. In a second terminal, from this `contracts/` directory, prompt silently then
   run the harness:

   ```sh
   read -rsp "Disposable Anvil private key: " MARGIN_CALL_PRIVATE_KEY
   echo
   export MARGIN_CALL_PRIVATE_KEY
   ./script/run-local.sh
   ```

   From the repository root:

   ```sh
   read -rsp "Disposable Anvil private key: " MARGIN_CALL_PRIVATE_KEY
   echo
   export MARGIN_CALL_PRIVATE_KEY
   pnpm test:contracts:smoke
   ```

   Equivalent Foundry command (still no `--private-key` flag):

   ```sh
   read -rsp "Disposable Anvil private key: " MARGIN_CALL_PRIVATE_KEY
   echo
   export MARGIN_CALL_PRIVATE_KEY
   forge script script/SpotPositionLifecycle.s.sol:SpotPositionLifecycle \
     --rpc-url http://127.0.0.1:8545 \
     --broadcast \
     -vv
   ```

   If `MARGIN_CALL_PRIVATE_KEY` is already set in the environment (non-interactive
   use), skip the prompt and run `pnpm test:contracts:smoke` or `./script/run-local.sh`.

4. Optional stock amount (raw 8-decimal units; default `1e8` = 1.0 local NVDAc):

   ```sh
   export MARGIN_CALL_STOCK_AMOUNT=100000000
   ```

5. Stop Anvil with Ctrl+C when finished. Discard the local key/session.

The harness deploys a **dev/test-only** `LocalNvdaC` token and a fresh production
`MarginCall`, mints a small balance to the signer, then broadcasts:

`deploy LocalNvdaC` → `deploy MarginCall` → `mint` → `approve` → `openPosition` → `closePosition`

## Broadcast artifacts

Foundry writes transaction hashes under:

```text
contracts/broadcast/SpotPositionLifecycle.s.sol/31337/run-latest.json
```

In that JSON, match `transactions[]` by `transactionType` / `contractName` / `function`:

| Step               | What to look for         |
| ------------------ | ------------------------ |
| Deploy local NVDAc | `CREATE` / `LocalNvdaC`  |
| Deploy MarginCall  | `CREATE` / `MarginCall`  |
| Mint               | `CALL` / `mint`          |
| Approve            | `CALL` / `approve`       |
| Open               | `CALL` / `openPosition`  |
| Close              | `CALL` / `closePosition` |

`broadcast/` is gitignored. Do not commit these files.

## Environment

| Variable                   | Required | Purpose                                                 |
| -------------------------- | -------- | ------------------------------------------------------- |
| `MARGIN_CALL_PRIVATE_KEY`  | yes      | Disposable Anvil account private key. Never a live key. |
| `MARGIN_CALL_STOCK_AMOUNT` | no       | Raw NVDAc units to open. Default `100000000`.           |
