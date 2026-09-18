#!/usr/bin/env bash
# Read-only Base launch preflight: print operator address and balances. Never prints keys.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib-base-mainnet.sh"

base_mainnet_no_arguments $#
base_mainnet_bootstrap "${BASH_SOURCE[0]}"
base_mainnet_resolve_operator

chain_id="$(base_mainnet_assert_chain_id "$RPC_URL")"

eth_of() { cast balance "$1" --rpc-url "$RPC_URL"; }
erc20_of() { cast call "$1" "balanceOf(address)(uint256)" "$2" --rpc-url "$RPC_URL"; }

echo "=== Base launch preflight (addresses and balances only) ==="
echo "chainId ${chain_id}"
echo "rpc ${RPC_URL}"
echo
echo "OPERATOR / deployer / asset admin / treasury: ${operator}"
echo "  ETH wei:   $(eth_of "$operator")"
echo "  NVDAc:     $(erc20_of "$BASE_NVDAC" "$operator")"
echo "  USDC:      $(erc20_of "$BASE_USDC" "$operator")"
echo
echo "Planned live actions (not executed by this script):"
echo "  1. Deploy MarginCall + CreditPool + oracle/execution adapters for NVDAc, AAPLc, METAc, GOOGLc"
echo "  2. Register the four launch rails (assetCount == 4)"
echo "  3. Seed a tiny CreditPool USDC amount, smoke treasury withdraw"
echo "  4. Financed open -> repay -> close against NVDAc (first launch rail)"
echo
echo "Suggested funding (tiny demo defaults):"
echo "  gas ETH + >= 1000000 NVDAc (0.01) + >= 20e6 USDC (\$20 seed) + ~2e6 USDC to repay"
echo
echo "This does not redeploy or touch the historical NVDA-only deployment."
echo "Private keys were not printed."
