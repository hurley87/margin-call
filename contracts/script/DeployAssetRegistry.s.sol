// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console2} from "forge-std/console2.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {MockPriceFeed} from "../src/mocks/MockPriceFeed.sol";
import {Utils} from "./utils/Utils.sol";

/// @notice Deploy AssetRegistry, seed the five launch Stock Tokens with MockPriceFeeds.
/// @dev Signing: set DEPLOYER_PRIVATE_KEY. Env:
///        ASSETREGISTRY_ADMIN         — optional; defaults to deployer
///        ASSETREGISTRY_INVENTORY     — optional; granted INVENTORY_ROLE when admin == deployer
///        ASSETREGISTRY_STALE_AFTER   — optional; seconds, default 3600
///        ASSETREGISTRY_SEED_FEEDS    — optional; "true" (default) deploys MockPriceFeeds + addAsset
///      Stock token addresses match `deployments/robinhood-testnet.stock-tokens.json`.
contract DeployAssetRegistry is Utils {
    uint256 internal constant ROBINHOOD_TESTNET_CHAIN_ID = 46_630;
    uint8 internal constant FEED_DECIMALS = 8;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address admin = vm.envOr("ASSETREGISTRY_ADMIN", deployer);
        address inventory = vm.envOr("ASSETREGISTRY_INVENTORY", address(0));
        uint64 staleAfter = uint64(vm.envOr("ASSETREGISTRY_STALE_AFTER", uint256(3_600)));
        bool seedFeeds = vm.envOr("ASSETREGISTRY_SEED_FEEDS", true);

        address[] memory tokens = launchTokens();
        string[] memory symbols = launchSymbols();
        uint256[] memory prices = launchPrices8();

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

    /// @notice Same five addresses as PackCustody `launchWhitelist` / stock-tokens.json.
    function launchTokens() public pure returns (address[] memory tokens) {
        tokens = new address[](5);
        tokens[0] = 0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02; // AMZN
        tokens[1] = 0x71178BAc73cBeb415514eB542a8995b82669778d; // AMD
        tokens[2] = 0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93; // NFLX
        tokens[3] = 0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0; // PLTR
        tokens[4] = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E; // TSLA
    }

    function launchSymbols() public pure returns (string[] memory symbols) {
        symbols = new string[](5);
        symbols[0] = "AMZN";
        symbols[1] = "AMD";
        symbols[2] = "NFLX";
        symbols[3] = "PLTR";
        symbols[4] = "TSLA";
    }

    /// @notice Illustrative 8-decimal USD prices for MockPriceFeed seeding (admin can retune).
    function launchPrices8() public pure returns (uint256[] memory prices) {
        prices = new uint256[](5);
        prices[0] = 185e8; // AMZN
        prices[1] = 160e8; // AMD
        prices[2] = 700e8; // NFLX
        prices[3] = 40e8; // PLTR
        prices[4] = 250e8; // TSLA
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
