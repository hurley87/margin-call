#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Native B20 execution is part of the test fixture, so the pinned base-forge check is shared with the
# Base-mainnet wrappers rather than re-stated here.
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../contracts/script/lib-base-mainnet.sh"

: "${BASE_MAINNET_RPC_URL:?Export BASE_MAINNET_RPC_URL with a Base mainnet archive RPC URL}"
base_mainnet_require_base_forge

cd "${SCRIPT_DIR}/../contracts"
export FOUNDRY_PROFILE=base-mainnet
export FOUNDRY_BASE=true
exec base-forge test -vv "$@"
