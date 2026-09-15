#!/usr/bin/env bash
set -euo pipefail

: "${BASE_MAINNET_RPC_URL:?Export BASE_MAINNET_RPC_URL with a Base mainnet archive RPC URL}"

if ! command -v base-forge >/dev/null 2>&1; then
  echo "error: install Base Foundry v1.1.1; see contracts/fork/README.md" >&2
  exit 1
fi

# Native B20 execution is part of the test fixture, so pin the executor too.
version="$(base-forge --version)"
if [[ "$version" != *"Commit SHA: dccbdfd0b37d364cc50e0e15f1686ab029543c6f"* ]]; then
  echo "error: expected Base Foundry v1.1.1 (dccbdfd0b37d364cc50e0e15f1686ab029543c6f)" >&2
  echo "Run: base-foundryup -i v1.1.1" >&2
  exit 1
fi

cd "$(dirname "${BASH_SOURCE[0]}")/../contracts"
export FOUNDRY_PROFILE=base-mainnet
export FOUNDRY_BASE=true
exec base-forge test --match-contract '^BaseMainnetTest$' -vv "$@"
