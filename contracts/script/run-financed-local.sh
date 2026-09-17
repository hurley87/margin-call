#!/usr/bin/env bash
# Local Anvil-only smoke harness for financed Position NFT open -> accrue -> repay -> close.
# Supply MARGIN_CALL_PRIVATE_KEY in the environment (see README.md silent prompt).
# Never pass the key as an argument.
set -euo pipefail

if [[ $# -gt 0 ]]; then
  echo "error: do not pass arguments. Set MARGIN_CALL_PRIVATE_KEY in the environment." >&2
  echo "See contracts/script/README.md" >&2
  exit 1
fi

RPC_URL="http://127.0.0.1:8545"

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
echo "Broadcast artifact: broadcast/FinancedPositionOpen.s.sol/31337/run-latest.json"

exec forge script script/FinancedPositionOpen.s.sol:FinancedPositionOpen \
  --rpc-url "$RPC_URL" \
  --broadcast \
  -vv
