// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console2} from "forge-std/console2.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {MockPriceFeed} from "../src/mocks/MockPriceFeed.sol";
import {LaunchTokens} from "./LaunchTokens.sol";
import {Utils} from "./utils/Utils.sol";

/// @notice Deploy AssetRegistry, seed the five launch Stock Tokens with MockPriceFeeds.
/// @dev Signing: set DEPLOYER_PRIVATE_KEY. Env:
///        ASSETREGISTRY_ADMIN         — optional; defaults to deployer
///        ASSETREGISTRY_INVENTORY     — optional; granted INVENTORY_ROLE when admin == deployer
///        ASSETREGISTRY_STALE_AFTER   — optional; seconds, defaults to uint64 max for seeded mocks
///        ASSETREGISTRY_SEED_FEEDS    — optional; "true" (default) deploys MockPriceFeeds + addAsset
///      Stock token addresses come from `LaunchTokens` (JSON mirror:
///      `deployments/robinhood-testnet.stock-tokens.json`).
contract DeployAssetRegistry is Utils {
    uint256 internal constant ROBINHOOD_TESTNET_CHAIN_ID = 46_630;
    uint8 internal constant FEED_DECIMALS = 8;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address admin = vm.envOr("ASSETREGISTRY_ADMIN", deployer);
        address inventory = vm.envOr("ASSETREGISTRY_INVENTORY", address(0));
        bool seedFeeds = vm.envOr("ASSETREGISTRY_SEED_FEEDS", true);
        uint64 staleAfter = _configuredStaleAfter(seedFeeds);

        address[] memory tokens = LaunchTokens.tokens();
        string[] memory symbols = LaunchTokens.symbols();
        uint256[] memory prices = LaunchTokens.seedPrices8();

        vm.startBroadcast(deployerKey);
        AssetRegistry registry = new AssetRegistry(admin);

        if (inventory != address(0)) {
            require(admin == deployer, "DeployAssetRegistry: deployer must be admin to grant inventory");
            registry.grantRole(keccak256("INVENTORY_ROLE"), inventory);
        }

        address[] memory feeds = new address[](tokens.length);
        if (seedFeeds) {
            require(admin == deployer, "DeployAssetRegistry: deployer must be admin to seed assets");
            for (uint256 i; i < tokens.length; ++i) {
                MockPriceFeed feed = new MockPriceFeed(admin, FEED_DECIMALS, prices[i]);
                feeds[i] = address(feed);
                registry.addAsset(tokens[i], address(feed), staleAfter);
            }
        }
        vm.stopBroadcast();

        console2.log("AssetRegistry deployed at:", address(registry));
        console2.log("Admin:", admin);
        console2.log("Deployer:", deployer);
        if (inventory != address(0)) {
            console2.log("Inventory role:", inventory);
        }
        for (uint256 i; i < tokens.length; ++i) {
            console2.log(symbols[i], tokens[i]);
            if (seedFeeds) {
                console2.log("  feed:", feeds[i]);
            }
        }

        _writeRecord(address(registry), deployer, admin, inventory, tokens, feeds, symbols, staleAfter, seedFeeds);
    }

    function _configuredStaleAfter(bool seedFeeds) internal view returns (uint64) {
        uint256 configured =
            vm.envOr("ASSETREGISTRY_STALE_AFTER", seedFeeds ? uint256(type(uint64).max) : uint256(3_600));
        require(configured <= type(uint64).max, "DeployAssetRegistry: staleAfter exceeds uint64");
        return uint64(configured);
    }

    function _writeRecord(
        address registry,
        address deployer,
        address admin,
        address inventory,
        address[] memory tokens,
        address[] memory feeds,
        string[] memory symbols,
        uint64 staleAfter,
        bool seedFeeds
    ) internal {
        string memory obj = "assetregistry";
        vm.serializeUint(obj, "version", 1);
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "address", registry);
        vm.serializeAddress(obj, "deployer", deployer);
        vm.serializeAddress(obj, "admin", admin);
        if (inventory != address(0)) {
            vm.serializeAddress(obj, "inventory", inventory);
        }
        vm.serializeUint(obj, "staleAfter", staleAfter);
        vm.serializeBool(obj, "seededMockFeeds", seedFeeds);
        vm.serializeAddress(obj, "tokens", tokens);
        if (seedFeeds) {
            vm.serializeAddress(obj, "feeds", feeds);
        }
        vm.serializeString(obj, "symbols", symbols);
        vm.serializeUint(obj, "blockNumber", block.number);
        vm.serializeUint(obj, "timestamp", block.timestamp);
        vm.serializeString(obj, "solc", "0.8.28");
        vm.serializeString(obj, "evmVersion", "cancun");
        vm.serializeUint(obj, "optimizerRuns", 1_000_000);
        vm.serializeString(obj, "bytecodeHash", "none");
        string memory finalJson = vm.serializeBool(obj, "cborMetadata", false);

        string memory fileName = block.chainid == ROBINHOOD_TESTNET_CHAIN_ID
            ? "robinhood-testnet.asset-registry"
            : string.concat("chain-", vm.toString(block.chainid), ".asset-registry");

        writeOutput(finalJson, fileName);
        console2.log("Wrote deployment record:", getOutputPath(fileName));
    }
}
