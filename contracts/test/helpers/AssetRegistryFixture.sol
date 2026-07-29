// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AssetRegistry} from "../../src/AssetRegistry.sol";
import {MockPriceFeed} from "../../src/mocks/MockPriceFeed.sol";
import {MockStockToken} from "../mocks/MockStockToken.sol";

/// @notice Shared AssetRegistry deployment: mixed-decimal Stock Tokens + MockPriceFeeds.
abstract contract AssetRegistryFixture is Test {
    uint8 internal constant FEED_DECIMALS = 8;
    uint64 internal constant STALE_AFTER = 1 hours;

    AssetRegistry internal registry;

    MockStockToken internal amzn; // 18
    MockStockToken internal amd; // 18
    MockStockToken internal nflx; // 8
    MockStockToken internal pltr; // 6
    MockStockToken internal tsla; // 18

    MockPriceFeed internal amznFeed;
    MockPriceFeed internal amdFeed;
    MockPriceFeed internal nflxFeed;
    MockPriceFeed internal pltrFeed;
    MockPriceFeed internal tslaFeed;

    address internal admin = makeAddr("admin");
    address internal inventory = makeAddr("inventory");
    address internal stranger = makeAddr("stranger");

    function setUp() public virtual {
        registry = new AssetRegistry(admin);

        amzn = new MockStockToken("Amazon Test Stock", "tAMZN", 18);
        amd = new MockStockToken("AMD Test Stock", "tAMD", 18);
        nflx = new MockStockToken("Netflix Test Stock", "tNFLX", 8);
        pltr = new MockStockToken("Palantir Test Stock", "tPLTR", 6);
        tsla = new MockStockToken("Tesla Test Stock", "tTSLA", 18);

        // Prices in 8 decimals (Chainlink-style): $100, $50, $200, $25, $300.
        amznFeed = new MockPriceFeed(admin, FEED_DECIMALS, 100e8);
        amdFeed = new MockPriceFeed(admin, FEED_DECIMALS, 50e8);
        nflxFeed = new MockPriceFeed(admin, FEED_DECIMALS, 200e8);
        pltrFeed = new MockPriceFeed(admin, FEED_DECIMALS, 25e8);
        tslaFeed = new MockPriceFeed(admin, FEED_DECIMALS, 300e8);

        vm.startPrank(admin);
        registry.grantRole(registry.INVENTORY_ROLE(), inventory);
        registry.addAsset(address(amzn), address(amznFeed), STALE_AFTER);
        registry.addAsset(address(amd), address(amdFeed), STALE_AFTER);
        registry.addAsset(address(nflx), address(nflxFeed), STALE_AFTER);
        registry.addAsset(address(pltr), address(pltrFeed), STALE_AFTER);
        registry.addAsset(address(tsla), address(tslaFeed), STALE_AFTER);
        vm.stopPrank();
    }

    function _single(address token, uint256 amount)
        internal
        pure
        returns (address[] memory tokens, uint256[] memory amounts)
    {
        tokens = new address[](1);
        amounts = new uint256[](1);
        tokens[0] = token;
        amounts[0] = amount;
    }
}
