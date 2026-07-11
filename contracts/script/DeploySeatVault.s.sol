// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {SeatVault} from "../src/SeatVault.sol";

/// @notice Deploy SeatVault to Base Sepolia.
/// Env:
///   MARGINCALL_TOKEN
///   ESCROW_ADDRESS
///   SEAT_THRESHOLD (optional, default 10_000e18)
///   CORNER_THRESHOLD (optional, default 50_000e18)
///   UNSTAKE_COOLDOWN (optional, default 1 days)
contract DeploySeatVault is Script {
    uint256 internal constant DEFAULT_SEAT = 10_000e18;
    uint256 internal constant DEFAULT_CORNER = 50_000e18;
    uint256 internal constant DEFAULT_COOLDOWN = 1 days;

    function run() external {
        address margincallToken = vm.envAddress("MARGINCALL_TOKEN");
        address escrow = vm.envAddress("ESCROW_ADDRESS");
        uint256 seatThreshold = vm.envOr("SEAT_THRESHOLD", DEFAULT_SEAT);
        uint256 cornerThreshold = vm.envOr("CORNER_THRESHOLD", DEFAULT_CORNER);
        uint256 unstakeCooldown = vm.envOr("UNSTAKE_COOLDOWN", DEFAULT_COOLDOWN);

        vm.startBroadcast();
        SeatVault vault = new SeatVault(escrow, margincallToken, seatThreshold, cornerThreshold, unstakeCooldown);
        vm.stopBroadcast();

        console2.log("SeatVault deployed at:", address(vault));
        console2.log("MARGINCALL token:", margincallToken);
        console2.log("Escrow:", escrow);
        console2.log("Seat threshold:", seatThreshold);
        console2.log("Corner threshold:", cornerThreshold);
        console2.log("Unstake cooldown:", unstakeCooldown);
    }
}
