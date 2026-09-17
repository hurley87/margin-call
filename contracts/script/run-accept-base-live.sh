#!/usr/bin/env bash
# LIVE Base mainnet AcceptV1 phased broadcast. Requires CONFIRM_BASE_MAINNET=I_UNDERSTAND.
# Prerequisites: DeployV1 live already wrote deployments/base-deploy.run.json; wallets funded.
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
base_mainnet_require_live_confirm
base_mainnet_normalize_accept_keys

FORGE_BIN="$(base_mainnet_forge_bin require-base)"
export FOUNDRY_BASE=true

RPC_URL="$BASE_MAINNET_RPC_URL"
chain_id="$(base_mainnet_assert_chain_id "$RPC_URL")"

unset MARGIN_CALL_DRY_RUN || true

if [[ ! -f deployments/base-deploy.run.json ]]; then
  echo "error: missing deployments/base-deploy.run.json — run live DeployV1 first" >&2
  exit 1
fi

alice="$(base_mainnet_addr_from_key "$OPERATOR_PRIVATE_KEY")"
executor="$(base_mainnet_addr_from_key "$EXECUTOR_PRIVATE_KEY")"
bob="$(base_mainnet_addr_from_key "$RECIPIENT_PRIVATE_KEY")"
if [[ "$alice" == "$executor" || "$alice" == "$bob" || "$executor" == "$bob" ]]; then
  echo "error: OPERATOR, EXECUTOR, and RECIPIENT must be three different addresses" >&2
  exit 1
fi

TARGET="script/AcceptV1.s.sol:AcceptV1"

run_phase() {
  local sig="$1"
  echo "--- ${sig} ---"
  "$FORGE_BIN" script "$TARGET" --sig "$sig" --rpc-url "$RPC_URL" --broadcast -vv
}

echo "LIVE AcceptV1 on Base mainnet (chain ${chain_id})."
echo "Using ${FORGE_BIN} (B20-capable) for NVDAc simulation."
echo "Addresses only: alice=${alice} executor=${executor} bob=${bob}"
echo "Private keys are never printed."

run_phase "seedAndTreasurySmoke()"
run_phase "openFinanced()"
run_phase "setExecutor()"
run_phase "executorReduceExposure()"
run_phase "transferToBob()"

# Simulation-only authority proof (no --broadcast).
"$FORGE_BIN" script "$TARGET" --sig "proveAuthorityLost()" --rpc-url "$RPC_URL" -vv

run_phase "bobRepay()"
run_phase "bobClose()"

echo "Accept run record: deployments/base-accept.run.json"
echo "Merge evidence into deployments/base.json (see BASE_MAINNET.md)."
