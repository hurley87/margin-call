// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MarginCallToken} from "../src/MarginCallToken.sol";

/// @notice Deploy MARGINCALL test token to Base Sepolia.
/// Env: INITIAL_MINT (optional, default 1_000_000e18)
contract DeployMarginCallToken is Script {
    uint256 internal constant DEFAULT_INITIAL_MINT = 1_000_000e18;

    function run() external {
        uint256 initialMint = vm.envOr("INITIAL_MINT", DEFAULT_INITIAL_MINT);

        vm.startBroadcast();
        MarginCallToken token = new MarginCallToken();
        token.mint(msg.sender, initialMint);
        vm.stopBroadcast();

        console2.log("MARGINCALL deployed at:", address(token));
        console2.log("Initial mint to deployer:", initialMint);
    }
}
