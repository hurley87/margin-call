#!/usr/bin/env bash
# Read-only Base mainnet preflight: print wallet addresses and balances. Never prints keys.
set -euo pipefail

if [[ $# -gt 0 ]]; then
  echo "error: do not pass arguments. Configure env per script/BASE_MAINNET.md" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib-base-mainnet.sh"

CONTRACTS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
base_mainnet_load_env "$CONTRACTS_DIR"
base_mainnet_require_cast
base_mainnet_require_rpc
base_mainnet_require_accept_keys
base_mainnet_normalize_accept_keys

RPC_URL="$BASE_MAINNET_RPC_URL"
chain_id="$(base_mainnet_assert_chain_id "$RPC_URL")"

alice="$(base_mainnet_addr_from_key "$OPERATOR_PRIVATE_KEY")"
executor="$(base_mainnet_addr_from_key "$EXECUTOR_PRIVATE_KEY")"
bob="$(base_mainnet_addr_from_key "$RECIPIENT_PRIVATE_KEY")"

if [[ "$alice" == "$executor" || "$alice" == "$bob" || "$executor" == "$bob" ]]; then
  echo "error: OPERATOR, EXECUTOR, and RECIPIENT must resolve to three different addresses" >&2
  exit 1
fi

NVDAC="0xb20000000000000000000078ee7ce2fE4908108C"
USDC="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

eth_of() { cast balance "$1" --rpc-url "$RPC_URL"; }
erc20_of() { cast call "$1" "balanceOf(address)(uint256)" "$2" --rpc-url "$RPC_URL"; }

echo "=== Base mainnet preflight (addresses and balances only) ==="
echo "chainId ${chain_id}"
echo "rpc ${RPC_URL}"
echo
echo "OPERATOR / Alice / deployer / treasury: ${alice}"
echo "  ETH wei:   $(eth_of "$alice")"
echo "  NVDAc:     $(erc20_of "$NVDAC" "$alice")"
echo "  USDC:      $(erc20_of "$USDC" "$alice")"
echo
echo "EXECUTOR / E: ${executor}"
echo "  ETH wei:   $(eth_of "$executor")"
echo "  (needs gas only; no USDC/NVDAc required for live reduceExposure)"
echo
echo "RECIPIENT / Bob: ${bob}"
echo "  ETH wei:   $(eth_of "$bob")"
echo "  USDC:      $(erc20_of "$USDC" "$bob")"
echo "  (needs gas + ~2e6 USDC to repay leftover debt)"
echo
echo "Suggested funding (tiny demo defaults):"
echo "  Alice: gas ETH + >= 1000000 NVDAc (0.01) + >= 20e6 USDC (\$20 seed)"
echo "  E:     dust ETH for one tx"
echo "  Bob:   dust ETH + ~2e6 USDC"
echo
echo "Private keys were not printed."
