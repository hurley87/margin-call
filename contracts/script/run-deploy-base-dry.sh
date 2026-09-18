#!/usr/bin/env bash
# Dry-run DeployLaunch against a current Base mainnet fork. No broadcast.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib-base-mainnet.sh"

base_mainnet_no_arguments $#
base_mainnet_bootstrap "${BASH_SOURCE[0]}"
base_mainnet_require_operator_keys

chain_id="$(base_mainnet_assert_chain_id "$RPC_URL")"

export MARGIN_CALL_DRY_RUN=1
export MARGIN_CALL_GIT_COMMIT
MARGIN_CALL_GIT_COMMIT="$(base_mainnet_git_commit)"

echo "Dry-run DeployLaunch on Base fork (chain ${chain_id}). No broadcast."
echo "Deploys MarginCall, CreditPool, and NVDAc/AAPLc/METAc/GOOGLc adapters."
echo "Private keys are read from the environment and are never printed."

forge script script/DeployLaunch.s.sol:DeployLaunch \
  --sig "run()" \
  --fork-url "$RPC_URL" \
  -vv
