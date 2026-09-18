#!/usr/bin/env bash
# LIVE Base mainnet AcceptLaunch phased broadcast. Requires CONFIRM_BASE_MAINNET=I_UNDERSTAND.
# Prerequisites: DeployLaunch live already wrote deployments/base-launch-deploy.run.json; operator funded.
# Do not execute in the multi-stock architecture PR. Human-controlled follow-up only.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib-base-mainnet.sh"

base_mainnet_no_arguments $#
base_mainnet_bootstrap "${BASH_SOURCE[0]}"
base_mainnet_require_live_confirm
base_mainnet_resolve_operator

FORGE_BIN="$(base_mainnet_forge_bin)"
export FOUNDRY_BASE=true

chain_id="$(base_mainnet_assert_chain_id "$RPC_URL")"

unset MARGIN_CALL_DRY_RUN

if [[ ! -f deployments/base-launch-deploy.run.json ]]; then
  echo "error: missing deployments/base-launch-deploy.run.json — run live DeployLaunch first" >&2
  exit 1
fi

TARGET="script/AcceptLaunch.s.sol:AcceptLaunch"

run_phase() {
  local sig="$1"
  echo "--- ${sig} ---"
  "$FORGE_BIN" script "$TARGET" --sig "$sig" --rpc-url "$RPC_URL" --broadcast -vv
}

echo "LIVE AcceptLaunch on Base mainnet (chain ${chain_id})."
echo "Using ${FORGE_BIN} (B20-capable) for tokenized-stock simulation."
echo "Operator only: ${operator}"
echo "Private keys are never printed."

run_phase "seedAndTreasurySmoke()"
run_phase "openFinanced()"
run_phase "repayAndClose()"

echo "Accept run record: deployments/base-launch-accept.run.json"
echo "Merge evidence into deployments/base.json (see BASE_LAUNCH.md)."
echo "Do not merge into deployments/base-nvda-only.legacy.json."
