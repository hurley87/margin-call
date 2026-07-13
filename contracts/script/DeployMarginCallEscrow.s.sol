// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MarginCallEscrow} from "../src/MarginCallEscrow.sol";

/// @notice Deploy MarginCallEscrow to Base Sepolia.
/// Env:
///   SETTLEMENT_OPERATOR_ADDRESS — initial settlement operator (enterDeal / settleEntry)
///   DEPOSITOR_BINDER_ADDRESS — initial depositor binder (setDepositor)
///   ENTRY_TIMEOUT_SECONDS — permissionless refund delay after enterDeal (default 3600)
contract DeployMarginCallEscrow is Script {
    address internal constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address internal constant IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;

    function run() external {
        address settlementOperator = vm.envAddress("SETTLEMENT_OPERATOR_ADDRESS");
        address depositorBinder = vm.envAddress("DEPOSITOR_BINDER_ADDRESS");
        uint256 entryTimeoutSeconds = vm.envOr("ENTRY_TIMEOUT_SECONDS", uint256(3600));

        vm.startBroadcast();
        MarginCallEscrow escrow =
            new MarginCallEscrow(USDC, IDENTITY_REGISTRY, settlementOperator, depositorBinder, entryTimeoutSeconds);
        vm.stopBroadcast();

        console2.log("MarginCallEscrow deployed at:", address(escrow));
        console2.log("Owner (deployer):", msg.sender);
        console2.log("Settlement operator:", settlementOperator);
        console2.log("Depositor binder:", depositorBinder);
        console2.log("Entry timeout (seconds):", entryTimeoutSeconds);
    }
}
