// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console2} from "forge-std/console2.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {Utils} from "./utils/Utils.sol";

/// @notice Deploy MockUSD to Robinhood Chain testnet and record the address.
/// @dev Signing: set DEPLOYER_PRIVATE_KEY, or export it from a Foundry keystore
///      (`cast wallet private-key --account <name>`). Env:
///        MOCKUSD_ADMIN  — optional; defaults to the deployer
///        MOCKUSD_MINTER — optional; granted MINTER_ROLE when admin == deployer
contract DeployMockUSD is Utils {
    uint256 internal constant ROBINHOOD_TESTNET_CHAIN_ID = 46_630;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address admin = vm.envOr("MOCKUSD_ADMIN", deployer);
        address minter = vm.envOr("MOCKUSD_MINTER", address(0));

        vm.startBroadcast(deployerKey);
        MockUSD token = new MockUSD(admin);
        if (minter != address(0)) {
            require(admin == deployer, "DeployMockUSD: deployer must be admin to grant minter");
            // Use the role constant directly so we don't broadcast a view call.
            token.grantRole(keccak256("MINTER_ROLE"), minter);
        }
        vm.stopBroadcast();

        console2.log("MockUSD deployed at:", address(token));
        console2.log("Admin:", admin);
        console2.log("Deployer:", deployer);
        if (minter != address(0)) {
            console2.log("Minter:", minter);
        }

        _writeRecord(address(token), deployer, admin, minter);
    }

    function _writeRecord(address token, address deployer, address admin, address minter) internal {
        string memory obj = "mockusd";
        vm.serializeUint(obj, "version", 1);
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "address", token);
        vm.serializeAddress(obj, "deployer", deployer);
        vm.serializeAddress(obj, "admin", admin);
        if (minter != address(0)) {
            vm.serializeAddress(obj, "minter", minter);
        }
        vm.serializeUint(obj, "blockNumber", block.number);
        vm.serializeUint(obj, "timestamp", block.timestamp);
        vm.serializeString(obj, "name", "Margin Call Mock USD (Test Asset)");
        vm.serializeString(obj, "symbol", "MOCKUSD");
        vm.serializeUint(obj, "decimals", 6);
        // Build fingerprint — matches foundry.toml default profile pins.
        vm.serializeString(obj, "solc", "0.8.28");
        vm.serializeString(obj, "evmVersion", "cancun");
        vm.serializeUint(obj, "optimizerRuns", 1_000_000);
        vm.serializeString(obj, "bytecodeHash", "none");
        string memory finalJson = vm.serializeBool(obj, "cborMetadata", false);

        string memory fileName = block.chainid == ROBINHOOD_TESTNET_CHAIN_ID
            ? "robinhood-testnet.mockusd"
            : string.concat("chain-", vm.toString(block.chainid), ".mockusd");

        writeOutput(finalJson, fileName);
        console2.log("Wrote deployment record:", getOutputPath(fileName));
    }
}
