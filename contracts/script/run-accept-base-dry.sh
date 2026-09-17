#!/usr/bin/env bash
# Dry-run AcceptV1 full A→E→B flow against a current Base mainnet fork. No broadcast.
set -euo pipefail

if [[ $# -gt 0 ]]; then
  echo "error: do not pass arguments. See script/BASE_MAINNET.md" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib-base-mainnet.sh"

CONTRACTS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$CONTRACTS_DIR"

base_mainnet_load_env "$CONTRACTS_DIR"
base_mainnet_require_cast
base_mainnet_require_rpc
base_mainnet_require_accept_keys
base_mainnet_normalize_accept_keys

FORGE_BIN="$(base_mainnet_forge_bin require-base)"
export FOUNDRY_BASE=true

RPC_URL="$BASE_MAINNET_RPC_URL"
chain_id="$(base_mainnet_assert_chain_id "$RPC_URL")"

export MARGIN_CALL_DRY_RUN=1

alice="$(base_mainnet_addr_from_key "$OPERATOR_PRIVATE_KEY")"
executor="$(base_mainnet_addr_from_key "$EXECUTOR_PRIVATE_KEY")"
bob="$(base_mainnet_addr_from_key "$RECIPIENT_PRIVATE_KEY")"
if [[ "$alice" == "$executor" || "$alice" == "$bob" || "$executor" == "$bob" ]]; then
  echo "error: OPERATOR, EXECUTOR, and RECIPIENT must be three different addresses" >&2
  exit 1
fi

echo "Dry-run AcceptV1 full flow on Base fork (chain ${chain_id}). No broadcast."
echo "Using ${FORGE_BIN} (B20-capable) for NVDAc simulation."
echo "Addresses only: alice=${alice} executor=${executor} bob=${bob}"
echo "Private keys are never printed."

"$FORGE_BIN" script script/AcceptV1.s.sol:AcceptV1 \
  --sig "dryRunFull()" \
  --fork-url "$RPC_URL" \
  -vv
