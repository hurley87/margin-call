#!/usr/bin/env bash
# Dry-run AcceptV1 full A→E→B flow against a current Base mainnet fork. No broadcast.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib-base-mainnet.sh"

base_mainnet_no_arguments $#
base_mainnet_bootstrap "${BASH_SOURCE[0]}"
base_mainnet_resolve_wallets

FORGE_BIN="$(base_mainnet_forge_bin)"
export FOUNDRY_BASE=true

chain_id="$(base_mainnet_assert_chain_id "$RPC_URL")"

export MARGIN_CALL_DRY_RUN=1

echo "Dry-run AcceptV1 full flow on Base fork (chain ${chain_id}). No broadcast."
echo "Using ${FORGE_BIN} (B20-capable) for NVDAc simulation."
echo "Addresses only: alice=${alice} executor=${executor} bob=${bob}"
echo "Private keys are never printed."

"$FORGE_BIN" script script/AcceptV1.s.sol:AcceptV1 \
  --sig "dryRunFull()" \
  --fork-url "$RPC_URL" \
  -vv
