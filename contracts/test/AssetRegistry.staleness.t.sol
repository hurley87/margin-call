// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AssetRegistry} from "../src/AssetRegistry.sol";
import {MockStockToken} from "./mocks/MockStockToken.sol";
import {AssetRegistryFixture} from "./helpers/AssetRegistryFixture.sol";

contract AssetRegistryStalenessTest is AssetRegistryFixture {
    function test_quote_staleFeedReverts() public {
        vm.prank(admin);
        amznFeed.setUpdatedAt(block.timestamp - STALE_AFTER - 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                AssetRegistry.FeedStale.selector,
                address(amzn),
                block.timestamp - STALE_AFTER - 1,
                STALE_AFTER,
                block.timestamp
            )
        );
        registry.quote(address(amzn), 1e18);
    }

    function test_quote_exactlyAtStaleBoundSucceeds() public {
        vm.prank(admin);
        amznFeed.setUpdatedAt(block.timestamp - STALE_AFTER);

        assertEq(registry.quote(address(amzn), 1e18), 100e18);
    }

    function test_setAssetFeed_maxStaleAfterMakesStaticMockNonExpiring() public {
        vm.prank(admin);
        amznFeed.setUpdatedAt(block.timestamp - STALE_AFTER - 1);

        vm.expectRevert();
        registry.quote(address(amzn), 1e18);

        vm.prank(admin);
        registry.setAssetFeed(address(amzn), address(amznFeed), type(uint64).max);

        AssetRegistry.Asset memory asset = registry.getAsset(address(amzn));
        assertEq(asset.feed, address(amznFeed));
        assertEq(asset.staleAfter, type(uint64).max);
        assertEq(registry.quote(address(amzn), 1e18), 100e18);
    }

    function test_setAssetFeed_nonAdminCannotDisableStaleness() public {
        vm.prank(stranger);
        vm.expectRevert();
        registry.setAssetFeed(address(amzn), address(amznFeed), type(uint64).max);
    }

    function test_quote_pausedFeedReverts() public {
        vm.prank(admin);
        amznFeed.setPaused(true);

        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.FeedPaused.selector, address(amzn)));
        registry.quote(address(amzn), 1e18);
    }

    function test_quote_invalidFeedReverts() public {
        vm.prank(admin);
        amznFeed.setValid(false);

        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.FeedInvalid.selector, address(amzn)));
        registry.quote(address(amzn), 1e18);
    }

    function test_quote_zeroPriceReverts() public {
        vm.prank(admin);
        amznFeed.setAnswer(0, block.timestamp, false, true);

        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.FeedZeroPrice.selector, address(amzn)));
        registry.quote(address(amzn), 1e18);
    }

    function test_navOf_oneStaleLegFailsClosed() public {
        vm.prank(admin);
        pltrFeed.setUpdatedAt(block.timestamp - STALE_AFTER - 1);

        address[] memory tokens = new address[](2);
        uint256[] memory amounts = new uint256[](2);
        tokens[0] = address(amzn);
        amounts[0] = 1e18;
        tokens[1] = address(pltr);
        amounts[1] = 1e6;

        vm.expectRevert(
            abi.encodeWithSelector(
                AssetRegistry.FeedStale.selector,
                address(pltr),
                block.timestamp - STALE_AFTER - 1,
                STALE_AFTER,
                block.timestamp
            )
        );
        registry.navOf(tokens, amounts);
    }

    function test_quote_unlistedReverts() public {
        MockStockToken ghost = new MockStockToken("Ghost", "tG", 18);
        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.AssetNotListed.selector, address(ghost)));
        registry.quote(address(ghost), 1e18);
    }
}
