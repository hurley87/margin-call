// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AssetRegistry} from "../src/AssetRegistry.sol";
import {MockPriceFeed} from "../src/mocks/MockPriceFeed.sol";
import {MockStockToken} from "./mocks/MockStockToken.sol";
import {AssetRegistryFixture} from "./helpers/AssetRegistryFixture.sol";

contract AssetRegistryLifecycleTest is AssetRegistryFixture {
    function test_addAsset_startsActiveAndDepositable() public view {
        AssetRegistry.Asset memory asset = registry.getAsset(address(amzn));
        assertEq(uint8(asset.status), uint8(AssetRegistry.Status.Active));
        assertEq(asset.feed, address(amznFeed));
        assertEq(asset.staleAfter, STALE_AFTER);
        assertEq(asset.tokenDecimals, 18);
        assertEq(asset.inventory, 0);
        assertTrue(registry.isDepositable(address(amzn)));
        assertTrue(registry.isInPriceBasket(address(amzn)));
    }

    function test_addAsset_revertsWhenAlreadyListed() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.AssetAlreadyListed.selector, address(amzn)));
        registry.addAsset(address(amzn), address(amznFeed), STALE_AFTER);
    }

    function test_addAsset_revertsForNonAdmin() public {
        MockStockToken extra = new MockStockToken("Extra", "tX", 18);
        MockPriceFeed feed = new MockPriceFeed(admin, FEED_DECIMALS, 10e8);
        vm.prank(stranger);
        vm.expectRevert();
        registry.addAsset(address(extra), address(feed), STALE_AFTER);
    }

    function test_setStatus_frozenExcludesDepositAndBasket() public {
        vm.prank(admin);
        registry.setStatus(address(amzn), AssetRegistry.Status.Frozen);

        assertFalse(registry.isDepositable(address(amzn)));
        assertFalse(registry.isInPriceBasket(address(amzn)));
    }

    function test_setStatus_delistingBlocksDepositKeepsBasket() public {
        vm.prank(admin);
        registry.setStatus(address(amzn), AssetRegistry.Status.Delisting);

        assertFalse(registry.isDepositable(address(amzn)));
        assertTrue(registry.isInPriceBasket(address(amzn)));
    }

    function test_setStatus_cannotSetUnlisted() public {
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                AssetRegistry.InvalidStatusTransition.selector,
                AssetRegistry.Status.Active,
                AssetRegistry.Status.Unlisted
            )
        );
        registry.setStatus(address(amzn), AssetRegistry.Status.Unlisted);
    }

    function test_removeAsset_requiresZeroInventory() public {
        vm.prank(inventory);
        registry.adjustInventory(address(amzn), 1);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.InventoryNotZero.selector, address(amzn), uint256(1)));
        registry.removeAsset(address(amzn));
    }

    function test_removeAsset_atZeroInventory() public {
        vm.prank(admin);
        registry.removeAsset(address(amzn));

        AssetRegistry.Asset memory asset = registry.getAsset(address(amzn));
        assertEq(uint8(asset.status), uint8(AssetRegistry.Status.Unlisted));
        assertEq(registry.listedCount(), 4);
        assertFalse(registry.isDepositable(address(amzn)));
        assertFalse(registry.isInPriceBasket(address(amzn)));
    }

    function test_adjustInventory_increaseAndDecrease() public {
        vm.prank(inventory);
        registry.adjustInventory(address(pltr), 10);
        assertEq(registry.getAsset(address(pltr)).inventory, 10);

        vm.prank(inventory);
        registry.adjustInventory(address(pltr), -3);
        assertEq(registry.getAsset(address(pltr)).inventory, 7);
    }

    function test_adjustInventory_underflowReverts() public {
        vm.prank(inventory);
        vm.expectRevert(
            abi.encodeWithSelector(AssetRegistry.InventoryUnderflow.selector, address(amzn), uint256(0), uint256(1))
        );
        registry.adjustInventory(address(amzn), -1);
    }

    function test_listedAssets_orderMatchesAdds() public view {
        address[] memory listed = registry.listedAssets();
        assertEq(listed.length, 5);
        assertEq(listed[0], address(amzn));
        assertEq(listed[4], address(tsla));
    }
}
