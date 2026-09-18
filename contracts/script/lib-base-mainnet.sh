#!/usr/bin/env bash
# Shared helpers for Base launch deploy / acceptance wrappers.
# Never print private keys. Never pass keys as CLI arguments.

set -euo pipefail

BASE_CHAIN_ID="8453"
CONFIRM_VALUE="I_UNDERSTAND"

# Shell cannot import Solidity, so these mirror contracts/src/V1Config.sol and LaunchAssets.sol,
# which stay the source of truth. Keep this the only shell copy.
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

base_mainnet_prompt_key() {
  # Usage: base_mainnet_prompt_key VAR_NAME "role description"
  # If the key is already exported (contracts/.env, or the parent shell) it is left alone. Otherwise it is
  # read from the terminal with echo off, so a real mainnet key never enters shell history, a file, or argv.
  # Exported for this shell only. Never echoed.
  local var_name="$1"
  local role="$2"
  local value
  if [[ -n "${!var_name:-}" ]]; then
    base_mainnet_normalize_key "$var_name"
    return 0
  fi
  if [[ ! -t 0 ]]; then
    echo "error: ${var_name} is unset (${role}) and there is no terminal to prompt on." >&2
    echo "Export it for this shell, or run interactively. See script/BASE_LAUNCH.md" >&2
    exit 1
  fi
  read -r -s -p "${var_name} (${role}), input hidden: " value < /dev/tty
  printf '\n' >&2
  if [[ -z "$value" ]]; then
    echo "error: ${var_name} cannot be empty" >&2
    exit 1
  fi
  printf -v "$var_name" '%s' "$value"
  export "${var_name?}"
  base_mainnet_normalize_key "$var_name"
}

base_mainnet_require_operator_keys() {
  base_mainnet_prompt_key OPERATOR_PRIVATE_KEY "deployer / asset admin / treasury"
}

base_mainnet_require_live_confirm() {
  if [[ "${CONFIRM_BASE_MAINNET:-}" != "$CONFIRM_VALUE" ]]; then
    echo "error: live Base mainnet broadcast requires CONFIRM_BASE_MAINNET=${CONFIRM_VALUE}" >&2
    echo "Dry-run first. See script/BASE_LAUNCH.md" >&2
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

base_mainnet_bootstrap() {
  # Usage: base_mainnet_bootstrap "${BASH_SOURCE[0]}"
  # Sets CONTRACTS_DIR and RPC_URL, loads contracts/.env, and checks the toolchain.
  local script_path="$1"
  local script_dir
  script_dir="$(cd "$(dirname "$script_path")" && pwd)"
  CONTRACTS_DIR="$(cd "${script_dir}/.." && pwd)"
  cd "$CONTRACTS_DIR"
  base_mainnet_load_env "$CONTRACTS_DIR"
  base_mainnet_require_foundry
  base_mainnet_require_rpc
  RPC_URL="$BASE_MAINNET_RPC_URL"
}

base_mainnet_no_arguments() {
  if [[ "$1" -gt 0 ]]; then
    echo "error: do not pass arguments. See script/BASE_LAUNCH.md" >&2
    exit 1
  fi
}

base_mainnet_resolve_operator() {
  # Sets operator from OPERATOR_PRIVATE_KEY. Derivation runs inside forge, which reads the key
  # via vm.envUint — deliberately NOT `cast wallet address --private-key`.
  base_mainnet_require_operator_keys
  local out
  if ! out="$(cd "$CONTRACTS_DIR" && forge script script/Actors.s.sol:Actors --sig 'printOperator()' 2>&1)"; then
    echo "error: could not derive operator address from OPERATOR_PRIVATE_KEY." >&2
    echo "See script/BASE_LAUNCH.md" >&2
    printf '%s\n' "$out" | grep -viE '[0-9a-fA-F]{64}' | tail -15 >&2 || true
    exit 1
  fi
  operator="$(base_mainnet_parse_actor "$out" operator)"
  if [[ -z "$operator" ]]; then
    echo "error: could not parse operator address from forge output" >&2
    exit 1
  fi
}

base_mainnet_parse_actor() {
  printf '%s\n' "$1" | sed -n "s/^[[:space:]]*ACTOR $2 \(0x[0-9a-fA-F]\{40\}\).*/\1/p" | head -1
}

base_mainnet_git_commit() {
  git -C "$(dirname "${BASH_SOURCE[0]}")/../.." rev-parse HEAD 2>/dev/null || echo "unknown"
}
