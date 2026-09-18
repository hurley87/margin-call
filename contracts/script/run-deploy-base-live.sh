#!/usr/bin/env bash
# LIVE Base mainnet DeployLaunch broadcast. Requires CONFIRM_BASE_MAINNET=I_UNDERSTAND.
# Do not execute in the multi-stock architecture PR. Human-controlled follow-up only.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib-base-mainnet.sh"

base_mainnet_no_arguments $#
base_mainnet_bootstrap "${BASH_SOURCE[0]}"
base_mainnet_require_operator_keys
base_mainnet_require_live_confirm

chain_id="$(base_mainnet_assert_chain_id "$RPC_URL")"

unset MARGIN_CALL_DRY_RUN
export MARGIN_CALL_GIT_COMMIT
MARGIN_CALL_GIT_COMMIT="$(base_mainnet_git_commit)"

VERIFY_ARGS=()
if [[ -n "${ETHERSCAN_API_KEY:-}" ]]; then
  VERIFY_ARGS+=(--verify --etherscan-api-key "$ETHERSCAN_API_KEY")
  echo "Source verification enabled via ETHERSCAN_API_KEY."
else
  echo "warning: ETHERSCAN_API_KEY unset; deploying without --verify" >&2
fi

echo "LIVE DeployLaunch broadcast on Base mainnet (chain ${chain_id})."
echo "Will deploy MarginCall, CreditPool, and NVDAc/AAPLc/METAc/GOOGLc adapters."
echo "Will NOT mutate the historical NVDA-only deployment."
echo "Private keys are read from the environment and are never printed."

forge script script/DeployLaunch.s.sol:DeployLaunch \
  --sig "run()" \
  --rpc-url "$RPC_URL" \
  --broadcast \
  ${VERIFY_ARGS[@]+"${VERIFY_ARGS[@]}"} \
  -vv

echo "Deploy run record: deployments/base-launch-deploy.run.json"
echo "After acceptance, record the curated launch manifest at deployments/base.json (see BASE_LAUNCH.md)."
echo "Do not merge into deployments/base-nvda-only.legacy.json."
