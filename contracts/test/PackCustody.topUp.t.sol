// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PackCustody} from "../src/PackCustody.sol";
import {PackCustodyFixture} from "./helpers/PackCustodyFixture.sol";

/// @notice Top-ups are the only way assets enter a Pack after mint, and they only ever add.
contract PackCustodyTopUpTest is PackCustodyFixture {
    event PackToppedUp(uint256 indexed tokenId, address indexed creator, address[] assets, uint256[] amounts);
    event PackUnlisted(uint256 indexed tokenId);

    uint256 internal packId;

    function setUp() public override {
        super.setUp();
        packId = _mintDefaultPack(creator);
    }

    // ========== Additions ==========

    function test_topUpIncrementsAnExistingAsset() public {
        (address[] memory assets, uint256[] memory amounts) = _single(address(amzn), 3e18);

        vm.prank(creator);
        packs.topUp(packId, assets, amounts);

        assertEq(packs.basketAmountOf(packId, address(amzn)), 5e18);
        assertEq(packs.basketOf(packId).length, 3);
    }

    function test_topUpAddsANewAsset() public {
        (address[] memory assets, uint256[] memory amounts) = _single(address(tsla), 8e18);

        vm.prank(creator);
        packs.topUp(packId, assets, amounts);

        assertEq(packs.basketAmountOf(packId, address(tsla)), 8e18);
        assertEq(packs.basketOf(packId).length, 4);
        assertEq(packs.basketAssetsOf(packId)[3], address(tsla));
    }

    function test_topUpMovesAssetsIntoCustody() public {
        uint256 custodyBefore = amzn.balanceOf(address(packs));
        uint256 creatorBefore = amzn.balanceOf(creator);

        (address[] memory assets, uint256[] memory amounts) = _single(address(amzn), 3e18);
        vm.prank(creator);
        packs.topUp(packId, assets, amounts);

        assertEq(amzn.balanceOf(address(packs)), custodyBefore + 3e18);
        assertEq(amzn.balanceOf(creator), creatorBefore - 3e18);
    }

    function test_topUpHandlesMixedNewAndExistingAssets() public {
        (address[] memory assets, uint256[] memory amounts) = _pair(address(pltr), 1e6, address(tsla), 2e18);

        vm.prank(creator);
        packs.topUp(packId, assets, amounts);

        assertEq(packs.basketAmountOf(packId, address(pltr)), 8e6);
        assertEq(packs.basketAmountOf(packId, address(tsla)), 2e18);
        assertEq(packs.basketOf(packId).length, 4);
    }

    function test_repeatedTopUpsAccumulate() public {
        (address[] memory assets, uint256[] memory amounts) = _single(address(amzn), 1e18);

        vm.startPrank(creator);
        packs.topUp(packId, assets, amounts);
        packs.topUp(packId, assets, amounts);
        packs.topUp(packId, assets, amounts);
        vm.stopPrank();

        assertEq(packs.basketAmountOf(packId, address(amzn)), 5e18);
    }

    function test_topUpEmitsPackToppedUpWithReceivedAmounts() public {
        (address[] memory assets, uint256[] memory amounts) = _single(address(amzn), 3e18);

        vm.expectEmit(true, true, false, true, address(packs));
        emit PackToppedUp(packId, creator, assets, amounts);

        vm.prank(creator);
        packs.topUp(packId, assets, amounts);
    }

    function test_topUpDoesNotAffectOtherPacks() public {
        uint256 otherPack = _mintDefaultPack(otherCreator);

        (address[] memory assets, uint256[] memory amounts) = _single(address(amzn), 3e18);
        vm.prank(creator);
        packs.topUp(packId, assets, amounts);

        assertEq(packs.basketAmountOf(otherPack, address(amzn)), 2e18);
    }

    // ========== Authorization ==========

    function test_nonCreatorCannotTopUp() public {
        (address[] memory assets, uint256[] memory amounts) = _single(address(amzn), 1e18);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.NotPackCreator.selector, packId, stranger));
        vm.prank(stranger);
        packs.topUp(packId, assets, amounts);
    }

    function test_otherCreatorCannotTopUpSomeoneElsesPack() public {
        (address[] memory assets, uint256[] memory amounts) = _single(address(amzn), 1e18);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.NotPackCreator.selector, packId, otherCreator));
        vm.prank(otherCreator);
        packs.topUp(packId, assets, amounts);
    }

    function test_approvedOperatorCannotTopUp() public {
        vm.prank(creator);
        packs.approve(stranger, packId);

        (address[] memory assets, uint256[] memory amounts) = _single(address(amzn), 1e18);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.NotPackCreator.selector, packId, stranger));
        vm.prank(stranger);
        packs.topUp(packId, assets, amounts);
    }

    // ========== Listing ==========

    function test_mintedPackIsListed() public view {
        assertTrue(packs.isListed(packId));
    }

    function test_unknownPackIsNotListed() public view {
        assertFalse(packs.isListed(999));
    }

    function test_transferUnlistsThePack() public {
        vm.expectEmit(true, false, false, false, address(packs));
        emit PackUnlisted(packId);

        vm.prank(creator);
        packs.transferFrom(creator, buyer, packId);

        assertFalse(packs.isListed(packId));
    }

    function test_creatorCannotTopUpAfterTransfer() public {
        vm.prank(creator);
        packs.transferFrom(creator, buyer, packId);

        (address[] memory assets, uint256[] memory amounts) = _single(address(amzn), 1e18);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.PackNotListed.selector, packId));
        vm.prank(creator);
        packs.topUp(packId, assets, amounts);
    }

    function test_newHolderCannotTopUp() public {
        vm.prank(creator);
        packs.transferFrom(creator, buyer, packId);

        (address[] memory assets, uint256[] memory amounts) = _single(address(amzn), 1e18);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.PackNotListed.selector, packId));
        vm.prank(buyer);
        packs.topUp(packId, assets, amounts);
    }

    function test_unlistingIsOneWayEvenIfTheCreatorBuysItBack() public {
        vm.prank(creator);
        packs.transferFrom(creator, buyer, packId);

        vm.prank(buyer);
        packs.transferFrom(buyer, creator, packId);

        assertEq(packs.ownerOf(packId), creator);
        assertFalse(packs.isListed(packId));

        (address[] memory assets, uint256[] memory amounts) = _single(address(amzn), 1e18);
        vm.expectRevert(abi.encodeWithSelector(PackCustody.PackNotListed.selector, packId));
        vm.prank(creator);
        packs.topUp(packId, assets, amounts);
    }

    function test_selfTransferDoesNotUnlist() public {
        vm.prank(creator);
        packs.transferFrom(creator, creator, packId);

        assertTrue(packs.isListed(packId));

        (address[] memory assets, uint256[] memory amounts) = _single(address(amzn), 1e18);
        vm.prank(creator);
        packs.topUp(packId, assets, amounts);

        assertEq(packs.basketAmountOf(packId, address(amzn)), 3e18);
    }

    function test_topUpRevertsForUnknownPack() public {
        (address[] memory assets, uint256[] memory amounts) = _single(address(amzn), 1e18);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.PackNotListed.selector, 999));
        vm.prank(creator);
        packs.topUp(999, assets, amounts);
    }

    // ========== Deposit rules ==========

    function test_topUpRevertsOnNonWhitelistedAsset() public {
        (address[] memory assets, uint256[] memory amounts) = _single(address(offList), 1e18);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.AssetNotWhitelisted.selector, address(offList)));
        vm.prank(creator);
        packs.topUp(packId, assets, amounts);
    }

    function test_topUpRevertsOnDeWhitelistedAsset() public {
        bytes32 role = packs.WHITELIST_ADMIN_ROLE();
        vm.prank(admin);
        packs.grantRole(role, admin);
        vm.prank(admin);
        packs.removeAsset(address(amzn));

        (address[] memory assets, uint256[] memory amounts) = _single(address(amzn), 1e18);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.AssetNotWhitelisted.selector, address(amzn)));
        vm.prank(creator);
        packs.topUp(packId, assets, amounts);
    }

    function test_topUpRevertsOnZeroAmount() public {
        (address[] memory assets, uint256[] memory amounts) = _single(address(amzn), 0);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.ZeroAmount.selector, address(amzn)));
        vm.prank(creator);
        packs.topUp(packId, assets, amounts);
    }

    function test_topUpRevertsOnEmptyBasket() public {
        vm.expectRevert(PackCustody.EmptyBasket.selector);
        vm.prank(creator);
        packs.topUp(packId, new address[](0), new uint256[](0));
    }

    function test_topUpRevertsOnLengthMismatch() public {
        address[] memory assets = new address[](2);
        assets[0] = address(amzn);
        assets[1] = address(tsla);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1e18;

        vm.expectRevert(PackCustody.LengthMismatch.selector);
        vm.prank(creator);
        packs.topUp(packId, assets, amounts);
    }

    function test_topUpRevertsOnDuplicateAsset() public {
        (address[] memory assets, uint256[] memory amounts) = _pair(address(amzn), 1e18, address(amzn), 1e18);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.DuplicateAsset.selector, address(amzn)));
        vm.prank(creator);
        packs.topUp(packId, assets, amounts);
    }

    function test_failedTopUpLeavesTheBasketUnchanged() public {
        (address[] memory assets, uint256[] memory amounts) = _pair(address(amzn), 1e18, address(offList), 1e18);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.AssetNotWhitelisted.selector, address(offList)));
        vm.prank(creator);
        packs.topUp(packId, assets, amounts);

        assertEq(packs.basketAmountOf(packId, address(amzn)), 2e18);
        assertEq(amzn.balanceOf(address(packs)), 2e18);
        assertEq(packs.basketOf(packId).length, 3);
    }

    // ========== Additions only ==========

    function test_noExternalFunctionRemovesAssetsFromAListedPack() public {
        // The full external surface for a listed Pack is mint, top-up, and whitelist
        // administration; none of them can reduce a recorded amount.
        uint256 before = packs.basketAmountOf(packId, address(amzn));

        (address[] memory assets, uint256[] memory amounts) = _single(address(amzn), 1e18);
        vm.prank(creator);
        packs.topUp(packId, assets, amounts);

        assertGt(packs.basketAmountOf(packId, address(amzn)), before);
    }
}
