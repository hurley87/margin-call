#!/usr/bin/env bash
# Local Anvil-only smoke harness for financed A -> E -> B executor transfer.
# Supply MARGIN_CALL_PRIVATE_KEY, MARGIN_CALL_EXECUTOR_KEY, and MARGIN_CALL_RECIPIENT_KEY
# in the environment (see README.md silent prompt). Never pass keys as arguments.
#
# Phases against one node. The node clock is advanced between phase 1 and phase 2 over Anvil RPC,
# because forge script --broadcast cannot vm.warp the live node. Transfer is a separate broadcast
# after repay so the pre-transfer accounting snapshot is read from settled chain state.
set -euo pipefail

if [[ $# -gt 0 ]]; then
  echo "error: do not pass arguments. Set the three Anvil keys in the environment." >&2
  echo "See contracts/script/README.md" >&2
  exit 1
fi

RPC_URL="${MARGIN_CALL_RPC_URL:-http://127.0.0.1:8545}"
SCRIPT_TARGET="script/FinancedExecutorTransfer.s.sol:FinancedExecutorTransfer"

# Seconds of real node time to put between the open and the executor/transfer phase. 30 days by default.
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

: "${MARGIN_CALL_PRIVATE_KEY:?Set MARGIN_CALL_PRIVATE_KEY to Alices disposable Anvil key. See contracts/script/README.md}"
: "${MARGIN_CALL_EXECUTOR_KEY:?Set MARGIN_CALL_EXECUTOR_KEY to the executors disposable Anvil key. See contracts/script/README.md}"
: "${MARGIN_CALL_RECIPIENT_KEY:?Set MARGIN_CALL_RECIPIENT_KEY to Bobs disposable Anvil key. See contracts/script/README.md}"

echo "Running financed A -> E -> B executor-transfer smoke test against local Anvil (${RPC_URL}, chain ${chain_id})"
echo "Private keys are read from the environment and are never printed."
echo "Broadcast artifacts: broadcast/FinancedExecutorTransfer.s.sol/31337/"

forge script "$SCRIPT_TARGET" --sig "deployAndOpen()" --rpc-url "$RPC_URL" --broadcast -vv

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

forge script "$SCRIPT_TARGET" --sig "appointAndRepay()" --rpc-url "$RPC_URL" --broadcast -vv
forge script "$SCRIPT_TARGET" --sig "transferToBob()" --rpc-url "$RPC_URL" --broadcast -vv

# Simulation-only authority proof (no --broadcast): A and E management calls must revert.
forge script "$SCRIPT_TARGET" --sig "proveAuthorityLost()" --rpc-url "$RPC_URL" -vv

forge script "$SCRIPT_TARGET" --sig "bobRepayAndVerify()" --rpc-url "$RPC_URL" --broadcast -vv
