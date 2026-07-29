// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console2} from "forge-std/console2.sol";
import {PackCustody} from "../src/PackCustody.sol";
import {LaunchTokens} from "./LaunchTokens.sol";
import {Utils} from "./utils/Utils.sol";

/// @notice Deploy PackCustody to Robinhood Chain testnet and record the address.
/// @dev Signing: set DEPLOYER_PRIVATE_KEY, or export it from a Foundry keystore
///      (`cast wallet private-key --account <name>`). Env:
///        PACKCUSTODY_ADMIN           — optional; defaults to the deployer
///        PACKCUSTODY_WHITELIST_ADMIN — optional; granted WHITELIST_ADMIN_ROLE when
///                                      admin == deployer
///        PACKCUSTODY_WHITELIST       — optional; comma-separated assets, defaults to
///                                      `LaunchTokens.tokens()`
contract DeployPackCustody is Utils {
    uint256 internal constant ROBINHOOD_TESTNET_CHAIN_ID = 46_630;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address admin = vm.envOr("PACKCUSTODY_ADMIN", deployer);
        address whitelistAdmin = vm.envOr("PACKCUSTODY_WHITELIST_ADMIN", address(0));
        address[] memory assets = vm.envOr("PACKCUSTODY_WHITELIST", ",", LaunchTokens.tokens());

        vm.startBroadcast(deployerKey);
        PackCustody custody = new PackCustody(admin, assets);
        if (whitelistAdmin != address(0)) {
            require(admin == deployer, "DeployPackCustody: deployer must be admin to grant whitelist admin");
            // Use the role constant directly so we don't broadcast a view call.
            custody.grantRole(keccak256("WHITELIST_ADMIN_ROLE"), whitelistAdmin);
        }
        vm.stopBroadcast();

        console2.log("PackCustody deployed at:", address(custody));
        console2.log("Admin:", admin);
        console2.log("Deployer:", deployer);
        if (whitelistAdmin != address(0)) {
            console2.log("Whitelist admin:", whitelistAdmin);
        }
        for (uint256 i; i < assets.length; ++i) {
            console2.log("Whitelisted:", assets[i]);
        }

        _writeRecord(address(custody), deployer, admin, whitelistAdmin, assets);
    }

    /// @notice Re-export for verify tooling that previously called `launchWhitelist()`.
    function launchWhitelist() public pure returns (address[] memory) {
        return LaunchTokens.tokens();
    }

    function _writeRecord(
        address custody,
        address deployer,
        address admin,
        address whitelistAdmin,
        address[] memory assets
    ) internal {
        string memory obj = "packcustody";
        vm.serializeUint(obj, "version", 1);
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "address", custody);
        vm.serializeAddress(obj, "deployer", deployer);
        vm.serializeAddress(obj, "admin", admin);
        if (whitelistAdmin != address(0)) {
            vm.serializeAddress(obj, "whitelistAdmin", whitelistAdmin);
        }
        vm.serializeAddress(obj, "whitelist", assets);
        vm.serializeUint(obj, "blockNumber", block.number);
        vm.serializeUint(obj, "timestamp", block.timestamp);
        vm.serializeString(obj, "name", "Margin Call Pack (Test Asset)");
        vm.serializeString(obj, "symbol", "PACK");
        // Build fingerprint — matches foundry.toml default profile pins.
        vm.serializeString(obj, "solc", "0.8.28");
        vm.serializeString(obj, "evmVersion", "cancun");
        vm.serializeUint(obj, "optimizerRuns", 1_000_000);
        vm.serializeString(obj, "bytecodeHash", "none");
        string memory finalJson = vm.serializeBool(obj, "cborMetadata", false);

        string memory fileName = block.chainid == ROBINHOOD_TESTNET_CHAIN_ID
            ? "robinhood-testnet.packcustody"
            : string.concat("chain-", vm.toString(block.chainid), ".packcustody");

        writeOutput(finalJson, fileName);
        console2.log("Wrote deployment record:", getOutputPath(fileName));
    }
}
