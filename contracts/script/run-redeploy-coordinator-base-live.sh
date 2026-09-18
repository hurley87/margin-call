#!/usr/bin/env bash
# LIVE Base mainnet RedeployCoordinator broadcast. Requires CONFIRM_BASE_MAINNET=I_UNDERSTAND.
# Human-controlled cutover step. Positions on the previous coordinator are NOT migrated.
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

echo "LIVE RedeployCoordinator broadcast on Base mainnet (chain ${chain_id})."
echo "Will deploy MarginCall + CreditPool only. Will NOT redeploy oracle or execution adapters."
echo "Positions on the previous coordinator stay at their old address and are not migrated."
echo "Private keys are read from the environment and are never printed."

forge script script/RedeployCoordinator.s.sol:RedeployCoordinator \
  --sig "run()" \
  --rpc-url "$RPC_URL" \
  --broadcast \
  ${VERIFY_ARGS[@]+"${VERIFY_ARGS[@]}"} \
  -vv

echo "Redeploy run record: deployments/base-coordinator-redeploy.run.json"
echo "Next: seed the NEW CreditPool, run live acceptance, then rewrite deployments/base.json."
echo "Then reset the Convex read model (convex/ingest.ts resetForRedeploy) to the new coordinator."
echo "Do not merge into deployments/base-nvda-only.legacy.json."
