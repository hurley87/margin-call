#!/usr/bin/env bash
# Shared helpers for Base-mainnet deploy / acceptance wrappers (issue #429).
# Never print private keys. Never pass keys as CLI arguments.

set -euo pipefail

BASE_CHAIN_ID="8453"
CONFIRM_VALUE="I_UNDERSTAND"

# Shell cannot import Solidity, so these mirror contracts/src/V1Config.sol, which stays the source of
# truth. Keep this the only shell copy: read them from here rather than re-typing literals in a wrapper.
BASE_NVDAC="0xb20000000000000000000078ee7ce2fE4908108C"
BASE_USDC="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

base_mainnet_load_env() {
  local contracts_dir="$1"
  if [[ -f "${contracts_dir}/.env" ]]; then
    # shellcheck disable=SC1091
    set -a
    # Export only non-comment KEY=VALUE lines; do not echo values.
    # shellcheck disable=SC1090
    source "${contracts_dir}/.env"
    set +a
  fi
}

base_mainnet_require_rpc() {
  : "${BASE_MAINNET_RPC_URL:?Set BASE_MAINNET_RPC_URL to a Base mainnet RPC URL}"
}

base_mainnet_require_foundry() {
  local bin
  for bin in cast forge; do
    if ! command -v "$bin" >/dev/null 2>&1; then
      echo "error: Foundry (${bin}) is required. Install with foundryup -i v1.4.3" >&2
      exit 1
    fi
  done
}

base_mainnet_require_base_forge() {
  if ! command -v base-forge >/dev/null 2>&1; then
    echo "error: Base Foundry (base-forge) is required for NVDAc / B20 simulation." >&2
    echo "See contracts/fork/README.md — install with: base-foundryup -i v1.1.1" >&2
    exit 1
  fi
  local version
  version="$(base-forge --version)"
  if [[ "$version" != *"Commit SHA: dccbdfd0b37d364cc50e0e15f1686ab029543c6f"* ]]; then
    echo "error: expected Base Foundry v1.1.1 (dccbdfd0b37d364cc50e0e15f1686ab029543c6f)" >&2
    echo "Run: base-foundryup -i v1.1.1" >&2
    exit 1
  fi
}

base_mainnet_forge_bin() {
  # B20 (NVDAc) execution needs the pinned Base Foundry build; stock forge cannot simulate it.
  base_mainnet_require_base_forge
  echo "base-forge"
}


base_mainnet_assert_chain_id() {
  local rpc_url="$1"
  local chain_id
  if ! chain_id="$(cast chain-id --rpc-url "$rpc_url" 2>/dev/null)"; then
    echo "error: cannot reach RPC at ${rpc_url}" >&2
    exit 1
  fi
  if [[ "$chain_id" != "$BASE_CHAIN_ID" ]]; then
    echo "error: Base mainnet only (chain id ${BASE_CHAIN_ID}); got ${chain_id}" >&2
    echo "Refusing Base Sepolia, Anvil, and every other network." >&2
    exit 1
  fi
  echo "$chain_id"
}

base_mainnet_require_operator_keys() {
  : "${OPERATOR_PRIVATE_KEY:?Set OPERATOR_PRIVATE_KEY (Alice / deployer / treasury). See script/BASE_MAINNET.md}"
}

base_mainnet_require_accept_keys() {
  base_mainnet_require_operator_keys
  : "${EXECUTOR_PRIVATE_KEY:?Set EXECUTOR_PRIVATE_KEY (executor E). See script/BASE_MAINNET.md}"
  : "${RECIPIENT_PRIVATE_KEY:?Set RECIPIENT_PRIVATE_KEY (Bob B). See script/BASE_MAINNET.md}"
}

base_mainnet_require_live_confirm() {
  if [[ "${CONFIRM_BASE_MAINNET:-}" != "$CONFIRM_VALUE" ]]; then
    echo "error: live Base mainnet broadcast requires CONFIRM_BASE_MAINNET=${CONFIRM_VALUE}" >&2
    echo "Dry-run first. See script/BASE_MAINNET.md" >&2
    exit 1
  fi
  if [[ "${MARGIN_CALL_DRY_RUN:-0}" != "0" ]]; then
    echo "error: refuse live broadcast while MARGIN_CALL_DRY_RUN is set" >&2
    exit 1
  fi
}

base_mainnet_normalize_key() {
  # Ensure forge vm.envUint accepts the key. Never echo the key.
  # Usage: base_mainnet_normalize_key VAR_NAME
  local var_name="$1"
  local value="${!var_name:-}"
  if [[ -z "$value" ]]; then
    return 0
  fi
  if [[ "$value" != 0x* && "$value" != 0X* ]]; then
    printf -v "$var_name" '%s' "0x${value}"
    export "$var_name"
  fi
}

base_mainnet_normalize_keys() {
  # Usage: base_mainnet_normalize_keys VAR_NAME...
  local var_name
  for var_name in "$@"; do
    base_mainnet_normalize_key "$var_name"
  done
}

base_mainnet_addr_from_key() {
  # Prints address only; never the key. Accepts with or without 0x.
  local key="$1"
  if [[ "$key" != 0x* && "$key" != 0X* ]]; then
    key="0x${key}"
  fi
  cast wallet address --private-key "$key"
}

base_mainnet_bootstrap() {
  # Usage: base_mainnet_bootstrap "${BASH_SOURCE[0]}" [--no-cd]
  # Sets CONTRACTS_DIR and RPC_URL, loads contracts/.env, and checks the toolchain.
  local script_path="$1"
  local script_dir
  script_dir="$(cd "$(dirname "$script_path")" && pwd)"
  CONTRACTS_DIR="$(cd "${script_dir}/.." && pwd)"
  if [[ "${2:-}" != "--no-cd" ]]; then
    cd "$CONTRACTS_DIR"
  fi
  base_mainnet_load_env "$CONTRACTS_DIR"
  base_mainnet_require_foundry
  base_mainnet_require_rpc
  RPC_URL="$BASE_MAINNET_RPC_URL"
}

base_mainnet_no_arguments() {
  if [[ "$1" -gt 0 ]]; then
    echo "error: do not pass arguments. See script/BASE_MAINNET.md" >&2
    exit 1
  fi
}

base_mainnet_resolve_wallets() {
  # Sets alice/executor/bob from the three accept keys and enforces the distinctness the
  # executor-clearing and lost-authority proofs depend on. Prints addresses only, never keys.
  base_mainnet_require_accept_keys
  base_mainnet_normalize_keys OPERATOR_PRIVATE_KEY EXECUTOR_PRIVATE_KEY RECIPIENT_PRIVATE_KEY
  alice="$(base_mainnet_addr_from_key "$OPERATOR_PRIVATE_KEY")"
  executor="$(base_mainnet_addr_from_key "$EXECUTOR_PRIVATE_KEY")"
  bob="$(base_mainnet_addr_from_key "$RECIPIENT_PRIVATE_KEY")"
  if [[ "$alice" == "$executor" || "$alice" == "$bob" || "$executor" == "$bob" ]]; then
    echo "error: OPERATOR, EXECUTOR, and RECIPIENT must resolve to three different addresses" >&2
    exit 1
  fi
}

base_mainnet_git_commit() {
  git -C "$(dirname "${BASH_SOURCE[0]}")/../.." rev-parse HEAD 2>/dev/null || echo "unknown"
}
