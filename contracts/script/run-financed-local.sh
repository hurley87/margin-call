#!/usr/bin/env bash
# Local Anvil-only smoke harness for financed Position NFT open -> accrue -> repay -> close.
# Supply MARGIN_CALL_PRIVATE_KEY in the environment (see README.md silent prompt).
# Never pass the key as an argument.
#
# Three phases against one node. The node clock is advanced between phase 1 and phase 2 over Anvil's own RPC,
# because `forge script --broadcast` simulates a script body locally and only then sends the recorded
# transactions: an in-script `vm.warp` moves the simulation and never the node, so a single-phase harness would
# broadcast the open and the repay into the same on-chain instant and prove no accrual at all.
set -euo pipefail

if [[ $# -gt 0 ]]; then
  echo "error: do not pass arguments. Set MARGIN_CALL_PRIVATE_KEY in the environment." >&2
  echo "See contracts/script/README.md" >&2
  exit 1
fi

RPC_URL="${MARGIN_CALL_RPC_URL:-http://127.0.0.1:8545}"
SCRIPT_TARGET="script/FinancedPositionOpen.s.sol:FinancedPositionOpen"

# Seconds of real node time to put between the open and the repay. 30 days by default.
ACCRUAL_WINDOW="${MARGIN_CALL_ACCRUAL_WINDOW:-2592000}"

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! command -v cast >/dev/null 2>&1; then
  echo "error: Foundry (cast) is required. Install with foundryup -i v1.4.3" >&2
  exit 1
fi

if ! chain_id="$(cast chain-id --rpc-url "$RPC_URL" 2>/dev/null)"; then
  echo "error: cannot reach local Anvil at $RPC_URL" >&2
  echo "Start Anvil first: anvil" >&2
  exit 1
fi

if [[ "$chain_id" != "31337" ]]; then
  echo "error: this harness is LOCAL ANVIL ONLY (chain id 31337); got ${chain_id}" >&2
  exit 1
fi

: "${MARGIN_CALL_PRIVATE_KEY:?Set MARGIN_CALL_PRIVATE_KEY to a disposable Anvil development key. See contracts/script/README.md}"

echo "Running financed Position NFT debt-lifecycle smoke test against local Anvil (${RPC_URL}, chain ${chain_id})"
echo "Private key is read from MARGIN_CALL_PRIVATE_KEY and is never printed."
echo "Broadcast artifacts: broadcast/FinancedPositionOpen.s.sol/31337/"

forge script "$SCRIPT_TARGET" --sig 'deployAndOpen()' --rpc-url "$RPC_URL" --broadcast -vv

ts_before="$(cast block latest --rpc-url "$RPC_URL" --field timestamp)"
echo "--- advancing Anvil clock by ${ACCRUAL_WINDOW}s over RPC (evm_increaseTime + evm_mine) ---"
cast rpc evm_increaseTime "$ACCRUAL_WINDOW" --rpc-url "$RPC_URL" >/dev/null
cast rpc evm_mine --rpc-url "$RPC_URL" >/dev/null
ts_after="$(cast block latest --rpc-url "$RPC_URL" --field timestamp)"
echo "node timestamp ${ts_before} -> ${ts_after} (+$((ts_after - ts_before))s)"

if (( ts_after - ts_before < ACCRUAL_WINDOW )); then
  echo "error: node clock did not advance by the requested window; refusing to report a passing lifecycle" >&2
  exit 1
fi

forge script "$SCRIPT_TARGET" --sig 'repayAndClose()' --rpc-url "$RPC_URL" --broadcast -vv

# Read-only pass over the settled node. No --broadcast: every value here is live chain state.
forge script "$SCRIPT_TARGET" --sig 'verify()' --rpc-url "$RPC_URL" -vv
