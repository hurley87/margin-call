// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AssetRegistry} from "../src/AssetRegistry.sol";
import {AssetRegistryFixture} from "./helpers/AssetRegistryFixture.sol";

contract AssetRegistrySettersTest is AssetRegistryFixture {
    function test_constructor_prdDefaults() public view {
        assertEq(registry.minPackNav(), 20e18);
        assertEq(registry.poolMax(), 300e18);
        assertEq(registry.alpha(), 1e18);
        assertEq(registry.surcharge(), 1e17);
        assertEq(registry.protocolShareOfSurcharge(), 25e16);
        assertEq(registry.maxBatchSize(), 5);
        assertFalse(registry.crownEnabled());
        assertEq(registry.crownShareOfSurcharge(), 1e17);
        assertEq(registry.crownBeatMargin(), 1e17);
    }

    function test_setMinPackNav_andPoolMax() public {
        vm.startPrank(admin);
        registry.setMinPackNav(25e18);
        registry.setPoolMax(400e18);
        vm.stopPrank();

        assertEq(registry.minPackNav(), 25e18);
        assertEq(registry.poolMax(), 400e18);
        assertTrue(registry.isNavInBand(25e18));
        assertTrue(registry.isNavInBand(400e18));
        assertFalse(registry.isNavInBand(24e18));
        assertFalse(registry.isNavInBand(401e18));
    }

    function test_setMinPackNav_zeroReverts() public {
        vm.prank(admin);
        vm.expectRevert(AssetRegistry.ZeroMinPackNav.selector);
        registry.setMinPackNav(0);
    }

    function test_setMinPackNav_abovePoolMaxReverts() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.InvalidBand.selector, uint256(301e18), uint256(300e18)));
        registry.setMinPackNav(301e18);
    }

    function test_setPoolMax_belowMinReverts() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.InvalidBand.selector, uint256(20e18), uint256(19e18)));
        registry.setPoolMax(19e18);
    }

    function test_setAlpha_surcharge_maxBatchSize() public {
        vm.startPrank(admin);
        registry.setAlpha(2e18);
        registry.setSurcharge(5e16);
        registry.setMaxBatchSize(10);
        vm.stopPrank();

        assertEq(registry.alpha(), 2e18);
        assertEq(registry.surcharge(), 5e16);
        assertEq(registry.maxBatchSize(), 10);
    }

    function test_setSurcharge_aboveWadReverts() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.RatioTooHigh.selector, uint256(1e18 + 1)));
        registry.setSurcharge(1e18 + 1);
    }

    function test_setMaxBatchSize_zeroReverts() public {
        vm.prank(admin);
        vm.expectRevert(AssetRegistry.ZeroMaxBatchSize.selector);
        registry.setMaxBatchSize(0);
    }

    function test_setProtocolAndCrownShares_sumMustFitWad() public {
        vm.startPrank(admin);
        registry.setCrownShareOfSurcharge(5e17);
        registry.setProtocolShareOfSurcharge(5e17);
        vm.stopPrank();

        assertEq(registry.protocolShareOfSurcharge() + registry.crownShareOfSurcharge(), 1e18);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.RatioTooHigh.selector, uint256(5e17 + 5e17 + 1)));
        registry.setProtocolShareOfSurcharge(5e17 + 1);
    }

    function test_crownParams() public {
        vm.startPrank(admin);
        registry.setCrownEnabled(true);
        registry.setCrownBeatMargin(15e16);
        vm.stopPrank();

        assertTrue(registry.crownEnabled());
        assertEq(registry.crownBeatMargin(), 15e16);
    }

    function test_setters_revertForNonAdmin() public {
        vm.startPrank(stranger);
        vm.expectRevert();
        registry.setMinPackNav(30e18);
        vm.expectRevert();
        registry.setCrownEnabled(true);
        vm.stopPrank();
    }

    function test_events_emittedOnSetters() public {
        vm.prank(admin);
        vm.expectEmit(false, false, false, true);
        emit AssetRegistry.MinPackNavSet(30e18);
        registry.setMinPackNav(30e18);

        vm.prank(admin);
        vm.expectEmit(false, false, false, true);
        emit AssetRegistry.CrownEnabledSet(true);
        registry.setCrownEnabled(true);
    }
}
