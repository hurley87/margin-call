// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {RipEngine} from "../src/RipEngine.sol";
import {RipEngineFixture} from "./helpers/RipEngineFixture.sol";

contract RipEnginePoolTest is Test, RipEngineFixture {
    function test_enterPool_enrollsListedPack() public {
        uint256 id = _mintPackAtNav(maker, 25 * WAD);
        vm.prank(maker);
        engine.enterPool(id);

        assertTrue(engine.isResting(id));
        assertEq(engine.makerOf(id), maker);
        assertEq(engine.restingCount(), 1);
        assertEq(engine.restingPackIds()[0], id);
    }

    function test_enterPool_nonCreatorReverts() public {
        uint256 id = _mintPackAtNav(maker, 25 * WAD);
        vm.expectRevert(abi.encodeWithSelector(RipEngine.NotPackCreator.selector, id, stranger));
        vm.prank(stranger);
        engine.enterPool(id);
    }

    function test_enterPool_unlistedReverts() public {
        uint256 id = _mintPackAtNav(maker, 25 * WAD);
        vm.prank(maker);
        packs.delistAndRedeem(id);

        vm.expectRevert(abi.encodeWithSelector(RipEngine.PackNotListed.selector, id));
        vm.prank(maker);
        engine.enterPool(id);
    }

    function test_enterPool_twiceReverts() public {
        uint256 id = _enrollPack(maker, 25 * WAD);
        vm.expectRevert(abi.encodeWithSelector(RipEngine.PackAlreadyResting.selector, id));
        vm.prank(maker);
        engine.enterPool(id);
    }

    function test_exitPool_makerWhileListed() public {
        uint256 id = _enrollPack(maker, 25 * WAD);
        vm.prank(maker);
        engine.exitPool(id);
        assertFalse(engine.isResting(id));
        assertEq(engine.restingCount(), 0);
        assertTrue(packs.isListed(id));
    }

    function test_exitPool_permissionlessWhenUnlisted() public {
        uint256 id = _enrollPack(maker, 25 * WAD);
        vm.prank(maker);
        packs.transferFrom(maker, stranger, id);
        assertFalse(packs.isListed(id));

        vm.prank(stranger);
        engine.exitPool(id);
        assertFalse(engine.isResting(id));
    }

    function test_exitPool_strangerWhileListedReverts() public {
        uint256 id = _enrollPack(maker, 25 * WAD);
        vm.expectRevert(abi.encodeWithSelector(RipEngine.NotPackCreator.selector, id, stranger));
        vm.prank(stranger);
        engine.exitPool(id);
    }

    function test_eligibleSnapshot_excludesFrozenAsset() public {
        uint256 id = _enrollPack(maker, 25 * WAD);
        _enrollPack(maker2, 30 * WAD);

        vm.prank(admin);
        registry.setStatus(address(amzn), AssetRegistry.Status.Frozen);

        (uint256[] memory ids,, uint256 eligible) = engine.eligibleSnapshot();
        assertEq(eligible, 0);
        assertEq(ids.length, 0);
        assertEq(engine.restingCount(), 2);
        assertTrue(engine.isResting(id));
    }

    function test_eligibleSnapshot_excludesStaleFeed() public {
        _enrollPack(maker, 25 * WAD);
        _enrollPack(maker2, 30 * WAD);

        vm.prank(admin);
        amznFeed.setUpdatedAt(block.timestamp - STALE_AFTER - 1);

        (,, uint256 eligible) = engine.eligibleSnapshot();
        assertEq(eligible, 0);
    }

    function test_eligibleSnapshot_excludesOutOfBand() public {
        uint256 dusty = _enrollPack(maker, 15 * WAD);
        uint256 ok = _enrollPack(maker2, 25 * WAD);

        (uint256[] memory ids, uint256[] memory navs, uint256 eligible) = engine.eligibleSnapshot();
        assertEq(eligible, 1);
        assertEq(ids[0], ok);
        assertEq(navs[0], 25 * WAD);
        assertTrue(engine.isResting(dusty));
    }
}
