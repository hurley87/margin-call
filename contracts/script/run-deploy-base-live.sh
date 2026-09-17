#!/usr/bin/env bash
# LIVE Base mainnet DeployV1 broadcast. Requires CONFIRM_BASE_MAINNET=I_UNDERSTAND.
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
base_mainnet_require_operator_keys
base_mainnet_require_live_confirm
base_mainnet_normalize_operator_key

RPC_URL="$BASE_MAINNET_RPC_URL"
chain_id="$(base_mainnet_assert_chain_id "$RPC_URL")"

unset MARGIN_CALL_DRY_RUN || true
export MARGIN_CALL_GIT_COMMIT
MARGIN_CALL_GIT_COMMIT="$(base_mainnet_git_commit)"

VERIFY_ARGS=()
if [[ -n "${ETHERSCAN_API_KEY:-}" ]]; then
  VERIFY_ARGS+=(--verify --etherscan-api-key "$ETHERSCAN_API_KEY")
  echo "Source verification enabled via ETHERSCAN_API_KEY."
else
  echo "warning: ETHERSCAN_API_KEY unset; deploying without --verify" >&2
fi

echo "LIVE DeployV1 broadcast on Base mainnet (chain ${chain_id})."
echo "Private keys are read from the environment and are never printed."

forge script script/DeployV1.s.sol:DeployV1 \
  --sig "run()" \
  --rpc-url "$RPC_URL" \
  --broadcast \
  ${VERIFY_ARGS[@]+"${VERIFY_ARGS[@]}"} \
  -vv

echo "Deploy run record: deployments/base-deploy.run.json"
echo "Merge into deployments/base.json by hand after acceptance (see BASE_MAINNET.md)."
