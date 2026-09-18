#!/usr/bin/env bash
# Dry-run AcceptLaunch compact flow against a current Base mainnet fork. No broadcast.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib-base-mainnet.sh"

base_mainnet_no_arguments $#
base_mainnet_bootstrap "${BASH_SOURCE[0]}"
base_mainnet_resolve_operator

FORGE_BIN="$(base_mainnet_forge_bin)"
export FOUNDRY_BASE=true

chain_id="$(base_mainnet_assert_chain_id "$RPC_URL")"

export MARGIN_CALL_DRY_RUN=1

echo "Dry-run AcceptLaunch on Base fork (chain ${chain_id}). No broadcast."
echo "Using ${FORGE_BIN} (B20-capable) for tokenized-stock simulation."
echo "Operator only: ${operator}"
echo "Private keys are never printed."

"$FORGE_BIN" script script/AcceptLaunch.s.sol:AcceptLaunch \
  --sig "dryRunFull()" \
  --fork-url "$RPC_URL" \
  -vv
