// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AssetRegistry} from "../src/AssetRegistry.sol";
import {AssetRegistryFixture} from "./helpers/AssetRegistryFixture.sol";

contract AssetRegistryNavTest is AssetRegistryFixture {
    /// @dev 1 AMZN ($100) → $100 WAD.
    function test_quote_oneWholeToken18Decimals() public view {
        assertEq(registry.quote(address(amzn), 1e18), 100e18);
    }

    /// @dev 1 NFLX unit with 8 token decimals at $200 → $200 WAD.
    function test_quote_mixedDecimals_nflx8() public view {
        assertEq(registry.quote(address(nflx), 1e8), 200e18);
    }

    /// @dev 2 PLTR units with 6 token decimals at $25 → $50 WAD.
    function test_quote_mixedDecimals_pltr6() public view {
        assertEq(registry.quote(address(pltr), 2e6), 50e18);
    }

    function test_navOf_sumsBasket() public view {
        address[] memory tokens = new address[](3);
        uint256[] memory amounts = new uint256[](3);
        tokens[0] = address(amzn);
        amounts[0] = 1e18; // $100
        tokens[1] = address(pltr);
        amounts[1] = 2e6; // $50
        tokens[2] = address(amd);
        amounts[2] = 1e18; // $50

        assertEq(registry.navOf(tokens, amounts), 200e18);
        assertTrue(registry.isNavInBand(200e18));
    }

    function test_navOf_bandEdges() public view {
        // minPackNav = $20, poolMax = $300
        assertTrue(registry.isNavInBand(20e18));
        assertTrue(registry.isNavInBand(300e18));
        assertFalse(registry.isNavInBand(20e18 - 1));
        assertFalse(registry.isNavInBand(300e18 + 1));
    }

    function test_navOf_dustBelowMinPackNav() public view {
        // 0.1 AMZN = $10 < minPackNav $20
        (address[] memory tokens, uint256[] memory amounts) = _single(address(amzn), 1e17);
        uint256 nav = registry.navOf(tokens, amounts);
        assertEq(nav, 10e18);
        assertFalse(registry.isNavInBand(nav));
    }

    function test_navOf_abovePoolMax() public view {
        // 2 TSLA = $600 > poolMax $300
        (address[] memory tokens, uint256[] memory amounts) = _single(address(tsla), 2e18);
        uint256 nav = registry.navOf(tokens, amounts);
        assertEq(nav, 600e18);
        assertFalse(registry.isNavInBand(nav));
    }

    function test_navOf_frozenAssetReverts() public {
        vm.prank(admin);
        registry.setStatus(address(amzn), AssetRegistry.Status.Frozen);

        (address[] memory tokens, uint256[] memory amounts) = _single(address(amzn), 1e18);
        vm.expectRevert(
            abi.encodeWithSelector(
                AssetRegistry.AssetNotInPriceBasket.selector, address(amzn), AssetRegistry.Status.Frozen
            )
        );
        registry.navOf(tokens, amounts);
    }

    function test_navOf_delistingAssetStillQuotes() public {
        vm.prank(admin);
        registry.setStatus(address(amzn), AssetRegistry.Status.Delisting);

        (address[] memory tokens, uint256[] memory amounts) = _single(address(amzn), 1e18);
        assertEq(registry.navOf(tokens, amounts), 100e18);
    }

    function test_navOf_emptyBasketReverts() public {
        address[] memory tokens = new address[](0);
        uint256[] memory amounts = new uint256[](0);
        vm.expectRevert(AssetRegistry.EmptyBasket.selector);
        registry.navOf(tokens, amounts);
    }

    function test_navOf_lengthMismatchReverts() public {
        address[] memory tokens = new address[](1);
        uint256[] memory amounts = new uint256[](2);
        tokens[0] = address(amzn);
        amounts[0] = 1e18;
        amounts[1] = 1e18;
        vm.expectRevert(AssetRegistry.LengthMismatch.selector);
        registry.navOf(tokens, amounts);
    }

    function test_navOf_duplicateAssetReverts() public {
        address[] memory tokens = new address[](2);
        uint256[] memory amounts = new uint256[](2);
        tokens[0] = address(amzn);
        amounts[0] = 1e18;
        tokens[1] = address(amzn);
        amounts[1] = 1e18;
        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.DuplicateAsset.selector, address(amzn)));
        registry.navOf(tokens, amounts);
    }

    function test_navOf_zeroAmountReverts() public {
        (address[] memory tokens, uint256[] memory amounts) = _single(address(amzn), 0);
        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.ZeroAmount.selector, address(amzn)));
        registry.navOf(tokens, amounts);
    }

    function test_isInPriceBasket_frozenExcluded() public {
        assertTrue(registry.isInPriceBasket(address(tsla)));
        vm.prank(admin);
        registry.setStatus(address(tsla), AssetRegistry.Status.Frozen);
        assertFalse(registry.isInPriceBasket(address(tsla)));
    }
}
