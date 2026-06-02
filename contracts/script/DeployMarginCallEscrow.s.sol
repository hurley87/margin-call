// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MarginCallEscrow} from "../src/MarginCallEscrow.sol";

/// @notice Deploy MarginCallEscrow to Base Sepolia.
/// Env: OPERATOR_ADDRESS — initial authorized operator (typically OPERATOR_PRIVATE_KEY account).
contract DeployMarginCallEscrow is Script {
    address internal constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address internal constant IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;

    function run() external {
        address operator = vm.envAddress("OPERATOR_ADDRESS");

        vm.startBroadcast();
        MarginCallEscrow escrow = new MarginCallEscrow(USDC, IDENTITY_REGISTRY, operator);
        vm.stopBroadcast();

        console2.log("MarginCallEscrow deployed at:", address(escrow));
        console2.log("Owner (deployer):", msg.sender);
        console2.log("Operator:", operator);
    }
}
