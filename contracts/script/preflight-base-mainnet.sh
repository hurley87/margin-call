#!/usr/bin/env bash
# Read-only Base mainnet preflight: print wallet addresses and balances. Never prints keys.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib-base-mainnet.sh"

base_mainnet_no_arguments $#
base_mainnet_bootstrap "${BASH_SOURCE[0]}"
base_mainnet_resolve_wallets

chain_id="$(base_mainnet_assert_chain_id "$RPC_URL")"

eth_of() { cast balance "$1" --rpc-url "$RPC_URL"; }
erc20_of() { cast call "$1" "balanceOf(address)(uint256)" "$2" --rpc-url "$RPC_URL"; }

echo "=== Base mainnet preflight (addresses and balances only) ==="
echo "chainId ${chain_id}"
echo "rpc ${RPC_URL}"
echo
echo "OPERATOR / Alice / deployer / treasury: ${alice}"
echo "  ETH wei:   $(eth_of "$alice")"
echo "  NVDAc:     $(erc20_of "$BASE_NVDAC" "$alice")"
echo "  USDC:      $(erc20_of "$BASE_USDC" "$alice")"
echo
echo "EXECUTOR / E: ${executor}"
echo "  ETH wei:   $(eth_of "$executor")"
echo "  (needs gas only; no USDC/NVDAc required for live reduceExposure)"
echo
echo "RECIPIENT / Bob: ${bob}"
echo "  ETH wei:   $(eth_of "$bob")"
echo "  USDC:      $(erc20_of "$BASE_USDC" "$bob")"
echo "  (needs gas + ~2e6 USDC to repay leftover debt)"
echo
echo "Suggested funding (tiny demo defaults):"
echo "  Alice: gas ETH + >= 1000000 NVDAc (0.01) + >= 20e6 USDC (\$20 seed)"
echo "  E:     dust ETH for one tx"
echo "  Bob:   dust ETH + ~2e6 USDC"
echo
echo "Private keys were not printed."
