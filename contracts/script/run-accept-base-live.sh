#!/usr/bin/env bash
# LIVE Base mainnet AcceptV1 phased broadcast. Requires CONFIRM_BASE_MAINNET=I_UNDERSTAND.
# Prerequisites: DeployV1 live already wrote deployments/base-deploy.run.json; wallets funded.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib-base-mainnet.sh"

base_mainnet_no_arguments $#
base_mainnet_bootstrap "${BASH_SOURCE[0]}"
base_mainnet_require_live_confirm
base_mainnet_resolve_wallets

FORGE_BIN="$(base_mainnet_forge_bin)"
export FOUNDRY_BASE=true

chain_id="$(base_mainnet_assert_chain_id "$RPC_URL")"

unset MARGIN_CALL_DRY_RUN

if [[ ! -f deployments/base-deploy.run.json ]]; then
  echo "error: missing deployments/base-deploy.run.json — run live DeployV1 first" >&2
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
