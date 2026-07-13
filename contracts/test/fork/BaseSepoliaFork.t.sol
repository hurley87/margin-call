// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {BaseSepoliaConstants} from "../helpers/BaseSepoliaConstants.sol";
import {SeatVault} from "../../src/SeatVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Minimal surface present on the active Base Sepolia escrow (may predate
///      #206 hardening getters like MAX_EXTRACTION_BPS / entryTimeoutSeconds).
interface IEscrowDeploymentProbe {
    function usdc() external view returns (address);
    function identityRegistry() external view returns (address);
    function owner() external view returns (address);
    function dealCount() external view returns (uint256);
}

/// @notice Read-only Base Sepolia fork checks against canonical deployment (#207).
/// @dev Requires BASE_SEPOLIA_RPC_URL. Soft-skips when unset.
///      Uses only chain 84532 addresses from BaseSepoliaConstants / active.json.
contract BaseSepoliaForkTest is Test {
    function setUp() public {
        string memory rpc;
        try vm.envString("BASE_SEPOLIA_RPC_URL") returns (string memory url) {
            rpc = url;
        } catch {
            vm.skip(true);
            return;
        }
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc, BaseSepoliaConstants.BLOCK_NUMBER);
        require(block.chainid == BaseSepoliaConstants.CHAIN_ID, "wrong chain");
    }

    function test_fork_escrowCanonicalAddressesAndPolicy() public view {
        IEscrowDeploymentProbe escrow =
            IEscrowDeploymentProbe(BaseSepoliaConstants.ESCROW);
        assertEq(escrow.usdc(), BaseSepoliaConstants.USDC);
        assertEq(escrow.identityRegistry(), BaseSepoliaConstants.IDENTITY_REGISTRY);
        assertTrue(escrow.owner() != address(0));
        // Live deployment has created deals; code must be present.
        assertGt(escrow.dealCount(), 0);
        assertGt(BaseSepoliaConstants.ESCROW.code.length, 0);
    }

    function test_fork_seatVaultPolicyMatchesDeploymentRecord() public view {
        SeatVault vault = SeatVault(BaseSepoliaConstants.SEAT_VAULT);
        assertEq(address(vault.escrow()), BaseSepoliaConstants.ESCROW);
        assertEq(address(vault.token()), BaseSepoliaConstants.MARGINCALL_TOKEN);
        assertEq(vault.seatThreshold(), BaseSepoliaConstants.SEAT_THRESHOLD);
        assertEq(vault.cornerOfficeThreshold(), BaseSepoliaConstants.CORNER_THRESHOLD);
        assertEq(vault.unstakeCooldown(), BaseSepoliaConstants.UNSTAKE_COOLDOWN);
        assertEq(
            vault.totalPrincipal(),
            IERC20(BaseSepoliaConstants.MARGINCALL_TOKEN).balanceOf(BaseSepoliaConstants.SEAT_VAULT)
        );
    }

    function test_fork_chainIdIsBaseSepolia() public view {
        assertEq(block.chainid, BaseSepoliaConstants.CHAIN_ID);
        assertEq(block.number, BaseSepoliaConstants.BLOCK_NUMBER);
    }
}
