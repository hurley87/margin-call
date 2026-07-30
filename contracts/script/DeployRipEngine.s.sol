// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console2} from "forge-std/console2.sol";
import {PackCustody} from "../src/PackCustody.sol";
import {RipEngine} from "../src/RipEngine.sol";
import {MockRandomness} from "../src/mocks/MockRandomness.sol";
import {Utils} from "./utils/Utils.sol";

/// @notice Deploy RipEngine + MockRandomness, grant PackCustody `RIP_ENGINE_ROLE`.
/// @dev Signing: set DEPLOYER_PRIVATE_KEY. Env:
///        PACKCUSTODY_ADDRESS / RIPENGINE_PACKS     — required PackCustody
///        ASSETREGISTRY_ADDRESS / RIPENGINE_REGISTRY — required AssetRegistry
///        MOCKUSD_ADDRESS / RIPENGINE_STABLECOIN     — required stablecoin
///        RIPENGINE_ADMIN                            — optional; defaults to deployer
///        RIPENGINE_SEED                             — optional MockRandomness base seed
///        RIPENGINE_GRANT_ROLE                       — optional; "true" (default) grants
///                                                     RIP_ENGINE_ROLE when deployer is packs admin
contract DeployRipEngine is Utils {
    uint256 internal constant ROBINHOOD_TESTNET_CHAIN_ID = 46_630;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address admin = vm.envOr("RIPENGINE_ADMIN", deployer);

        address packs = vm.envOr("RIPENGINE_PACKS", address(0));
        if (packs == address(0)) {
            packs = vm.envAddress("PACKCUSTODY_ADDRESS");
        }
        address registry = vm.envOr("RIPENGINE_REGISTRY", address(0));
        if (registry == address(0)) {
            registry = vm.envAddress("ASSETREGISTRY_ADDRESS");
        }
        address stablecoin = vm.envOr("RIPENGINE_STABLECOIN", address(0));
        if (stablecoin == address(0)) {
            stablecoin = vm.envAddress("MOCKUSD_ADDRESS");
        }

        uint256 seed = vm.envOr("RIPENGINE_SEED", uint256(0xC0FFEE));
        bool grantRole = vm.envOr("RIPENGINE_GRANT_ROLE", true);

        vm.startBroadcast(deployerKey);
        MockRandomness randomness = new MockRandomness(admin, seed);
        RipEngine engine = new RipEngine(admin, packs, registry, stablecoin, address(randomness));

        if (grantRole) {
            require(admin == deployer, "DeployRipEngine: deployer must be admin to grant RIP_ENGINE_ROLE");
            PackCustody(packs).grantRole(keccak256("RIP_ENGINE_ROLE"), address(engine));
        }
        vm.stopBroadcast();

        console2.log("RipEngine deployed at:", address(engine));
        console2.log("MockRandomness:", address(randomness));
        console2.log("PackCustody:", packs);
        console2.log("AssetRegistry:", registry);
        console2.log("Stablecoin:", stablecoin);
        console2.log("Admin:", admin);

        _writeRecord(address(engine), address(randomness), packs, registry, stablecoin, deployer, admin, grantRole);
    }

    function _writeRecord(
        address engine,
        address randomness,
        address packs,
        address registry,
        address stablecoin,
        address deployer,
        address admin,
        bool grantedRole
    ) internal {
        string memory obj = "ripengine";
        vm.serializeUint(obj, "version", 1);
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "address", engine);
        vm.serializeAddress(obj, "randomness", randomness);
        vm.serializeAddress(obj, "packs", packs);
        vm.serializeAddress(obj, "registry", registry);
        vm.serializeAddress(obj, "stablecoin", stablecoin);
        vm.serializeAddress(obj, "deployer", deployer);
        vm.serializeAddress(obj, "admin", admin);
        vm.serializeBool(obj, "grantedRipEngineRole", grantedRole);
        vm.serializeUint(obj, "blockNumber", block.number);
        vm.serializeUint(obj, "timestamp", block.timestamp);
        vm.serializeString(obj, "solc", "0.8.28");
        vm.serializeString(obj, "evmVersion", "cancun");
        vm.serializeUint(obj, "optimizerRuns", 1_000_000);
        vm.serializeString(obj, "bytecodeHash", "none");
        string memory finalJson = vm.serializeBool(obj, "cborMetadata", false);

        string memory fileName = block.chainid == ROBINHOOD_TESTNET_CHAIN_ID
            ? "robinhood-testnet.rip-engine"
            : string.concat("chain-", vm.toString(block.chainid), ".rip-engine");

        writeOutput(finalJson, fileName);
        console2.log("Wrote deployment record:", getOutputPath(fileName));
    }
}
