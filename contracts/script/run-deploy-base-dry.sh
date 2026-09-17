#!/usr/bin/env bash
# Dry-run DeployV1 against a current Base mainnet fork. No broadcast.
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
base_mainnet_normalize_operator_key

RPC_URL="$BASE_MAINNET_RPC_URL"
chain_id="$(base_mainnet_assert_chain_id "$RPC_URL")"

export MARGIN_CALL_DRY_RUN=1
export MARGIN_CALL_GIT_COMMIT
MARGIN_CALL_GIT_COMMIT="$(base_mainnet_git_commit)"

echo "Dry-run DeployV1 on Base fork (chain ${chain_id}). No broadcast."
echo "Private keys are read from the environment and are never printed."

forge script script/DeployV1.s.sol:DeployV1 \
  --sig "run()" \
  --fork-url "$RPC_URL" \
  -vv
