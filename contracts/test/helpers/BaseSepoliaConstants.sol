// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Canonical Base Sepolia addresses and fork pin for security-matrix tests.
/// @dev Addresses match `contracts/deployments/base-sepolia.active.json` (chainId 84532).
///      BLOCK_NUMBER is pinned so fork tests are deterministic; bump intentionally when
///      redeploying or when a newer tip is required for policy reads.
///      Note: the active escrow may still be the pre-#206 bytecode until #211 redeploys;
///      fork probes use a minimal interface for getters that exist on-chain today.
library BaseSepoliaConstants {
    uint256 internal constant CHAIN_ID = 84532;

    /// @dev Base Sepolia tip around 2026-07-13, after active escrow/SeatVault deployment
    ///      dated 2026-07-11 (`base-sepolia.active.json`).
    uint256 internal constant BLOCK_NUMBER = 44_099_000;

    address internal constant ESCROW = 0xa244550f0e35032E9c0b09DA4EB4933848d28d16;
    address internal constant MARGINCALL_TOKEN = 0x0d93099c1b24C848e7A7DD77c5a50de0735A60d7;
    address internal constant SEAT_VAULT = 0xa8595b279Aeadc8a0d2ce779Dc8Ba4d978eA2f44;
    address internal constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address internal constant IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;

    uint256 internal constant SEAT_THRESHOLD = 10_000e18;
    uint256 internal constant CORNER_THRESHOLD = 50_000e18;
    uint256 internal constant UNSTAKE_COOLDOWN = 86_400;
}
