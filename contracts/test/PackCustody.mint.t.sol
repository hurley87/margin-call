// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {PackCustody} from "../src/PackCustody.sol";
import {MockStockToken} from "./mocks/MockStockToken.sol";
import {MockFeeOnTransferToken} from "./mocks/MockFeeOnTransferToken.sol";
import {PackCustodyFixture} from "./helpers/PackCustodyFixture.sol";

contract PackCustodyMintTest is PackCustodyFixture {
    event PackMinted(uint256 indexed tokenId, address indexed creator, address[] assets, uint256[] amounts);

    // ========== Construction ==========

    function test_constructorRecordsWhitelist() public view {
        address[] memory listed = packs.whitelistedAssets();

        assertEq(listed.length, 5);
        assertEq(listed[0], address(amzn));
        assertEq(listed[4], address(tsla));

        assertTrue(packs.isWhitelisted(address(amzn)));
        assertTrue(packs.isWhitelisted(address(tsla)));
        assertFalse(packs.isWhitelisted(address(offList)));
    }

    function test_constructorGrantsAdminRoleOnly() public view {
        assertTrue(packs.hasRole(packs.DEFAULT_ADMIN_ROLE(), admin));
        assertFalse(packs.hasRole(packs.WHITELIST_ADMIN_ROLE(), admin));
    }

    function test_constructorRejectsZeroAdmin() public {
        vm.expectRevert(PackCustody.ZeroAddress.selector);
        new PackCustody(address(0), whitelist);
    }

    function test_constructorRejectsEmptyWhitelist() public {
        vm.expectRevert(PackCustody.EmptyWhitelist.selector);
        new PackCustody(admin, new address[](0));
    }

    function test_constructorRejectsZeroAsset() public {
        address[] memory bad = new address[](1);
        vm.expectRevert(PackCustody.ZeroAddress.selector);
        new PackCustody(admin, bad);
    }

    function test_constructorRejectsDuplicateAsset() public {
        address[] memory bad = new address[](2);
        bad[0] = address(amzn);
        bad[1] = address(amzn);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.AlreadyWhitelisted.selector, address(amzn)));
        new PackCustody(admin, bad);
    }

    function test_supportsErc721AndAccessControlInterfaces() public view {
        assertTrue(packs.supportsInterface(type(IERC165).interfaceId));
        assertTrue(packs.supportsInterface(type(IERC721).interfaceId));
        assertTrue(packs.supportsInterface(type(IAccessControl).interfaceId));
    }

    // ========== Minting ==========

    function test_mintRecordsFullBasket() public {
        (address[] memory assets, uint256[] memory amounts) = _defaultBasket();

        vm.prank(creator);
        uint256 tokenId = packs.mint(assets, amounts);

        PackCustody.BasketEntry[] memory basket = packs.basketOf(tokenId);
        assertEq(basket.length, 3);
        assertEq(basket[0].asset, address(amzn));
        assertEq(basket[0].amount, 2e18);
        assertEq(basket[1].asset, address(nflx));
        assertEq(basket[1].amount, 5e8);
        assertEq(basket[2].asset, address(pltr));
        assertEq(basket[2].amount, 7e6);
    }

    function test_mintTransfersBasketIntoCustody() public {
        uint256 creatorBefore = amzn.balanceOf(creator);

        (address[] memory assets, uint256[] memory amounts) = _defaultBasket();
        vm.prank(creator);
        packs.mint(assets, amounts);

        assertEq(amzn.balanceOf(address(packs)), 2e18);
        assertEq(nflx.balanceOf(address(packs)), 5e8);
        assertEq(pltr.balanceOf(address(packs)), 7e6);
        assertEq(amzn.balanceOf(creator), creatorBefore - 2e18);
    }

    function test_mintAssignsOwnershipAndCreator() public {
        uint256 tokenId = _mintDefaultPack(creator);

        assertEq(packs.ownerOf(tokenId), creator);
        assertEq(packs.creatorOf(tokenId), creator);
        assertEq(packs.balanceOf(creator), 1);
    }

    function test_mintAssignsSequentialTokenIdsFromOne() public {
        uint256 first = _mintDefaultPack(creator);
        uint256 second = _mintDefaultPack(otherCreator);

        assertEq(first, 1);
        assertEq(second, 2);
        assertEq(packs.totalMinted(), 2);
    }

    function test_mintEmitsPackMintedWithReceivedAmounts() public {
        (address[] memory assets, uint256[] memory amounts) = _defaultBasket();

        vm.expectEmit(true, true, false, true, address(packs));
        emit PackMinted(1, creator, assets, amounts);

        vm.prank(creator);
        packs.mint(assets, amounts);
    }

    function test_mintAcceptsSingleAssetBasket() public {
        (address[] memory assets, uint256[] memory amounts) = _single(address(tsla), 3e18);

        vm.prank(creator);
        uint256 tokenId = packs.mint(assets, amounts);

        PackCustody.BasketEntry[] memory basket = packs.basketOf(tokenId);
        assertEq(basket.length, 1);
        assertEq(basket[0].asset, address(tsla));
        assertEq(basket[0].amount, 3e18);
    }

    function test_mintAcceptsFullWhitelistBasket() public {
        address[] memory assets = new address[](5);
        uint256[] memory amounts = new uint256[](5);
        for (uint256 i; i < whitelist.length; ++i) {
            assets[i] = whitelist[i];
            amounts[i] = 10 ** MockStockToken(whitelist[i]).decimals();
        }

        vm.prank(creator);
        uint256 tokenId = packs.mint(assets, amounts);

        assertEq(packs.basketOf(tokenId).length, 5);
    }

    function test_separatePacksAccountSeparately() public {
        uint256 first = _mintDefaultPack(creator);
        uint256 second = _mintDefaultPack(otherCreator);

        assertEq(packs.basketAmountOf(first, address(amzn)), 2e18);
        assertEq(packs.basketAmountOf(second, address(amzn)), 2e18);
        assertEq(amzn.balanceOf(address(packs)), 4e18);
    }

    // ========== Minting: rejections ==========

    function test_mintRevertsOnEmptyBasket() public {
        vm.expectRevert(PackCustody.EmptyBasket.selector);
        vm.prank(creator);
        packs.mint(new address[](0), new uint256[](0));
    }

    function test_mintRevertsOnLengthMismatch() public {
        address[] memory assets = new address[](2);
        assets[0] = address(amzn);
        assets[1] = address(nflx);

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1e18;

        vm.expectRevert(PackCustody.LengthMismatch.selector);
        vm.prank(creator);
        packs.mint(assets, amounts);
    }

    function test_mintRevertsOnNonWhitelistedAsset() public {
        (address[] memory assets, uint256[] memory amounts) = _single(address(offList), 1e18);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.AssetNotWhitelisted.selector, address(offList)));
        vm.prank(creator);
        packs.mint(assets, amounts);
    }

    function test_mintRevertsWhenAnyAssetIsNotWhitelisted() public {
        (address[] memory assets, uint256[] memory amounts) = _pair(address(amzn), 1e18, address(offList), 1e18);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.AssetNotWhitelisted.selector, address(offList)));
        vm.prank(creator);
        packs.mint(assets, amounts);
    }

    function test_mintRevertsOnZeroAmount() public {
        (address[] memory assets, uint256[] memory amounts) = _pair(address(amzn), 1e18, address(nflx), 0);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.ZeroAmount.selector, address(nflx)));
        vm.prank(creator);
        packs.mint(assets, amounts);
    }

    function test_mintRevertsOnDuplicateAsset() public {
        (address[] memory assets, uint256[] memory amounts) = _pair(address(amzn), 1e18, address(amzn), 2e18);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.DuplicateAsset.selector, address(amzn)));
        vm.prank(creator);
        packs.mint(assets, amounts);
    }

    function test_mintRevertsWithoutApproval() public {
        address unapproved = makeAddr("unapproved");
        amzn.mint(unapproved, 5e18);

        (address[] memory assets, uint256[] memory amounts) = _single(address(amzn), 1e18);

        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(packs), 0, 1e18)
        );
        vm.prank(unapproved);
        packs.mint(assets, amounts);
    }

    function test_mintRevertsOnInsufficientBalance() public {
        address broke = makeAddr("broke");
        vm.prank(broke);
        amzn.approve(address(packs), type(uint256).max);

        (address[] memory assets, uint256[] memory amounts) = _single(address(amzn), 1e18);

        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, broke, 0, 1e18));
        vm.prank(broke);
        packs.mint(assets, amounts);
    }

    function test_failedMintLeavesNoCustodyOrToken() public {
        (address[] memory assets, uint256[] memory amounts) = _pair(address(amzn), 1e18, address(offList), 1e18);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.AssetNotWhitelisted.selector, address(offList)));
        vm.prank(creator);
        packs.mint(assets, amounts);

        assertEq(amzn.balanceOf(address(packs)), 0);
        assertEq(packs.totalMinted(), 0);
        assertEq(packs.balanceOf(creator), 0);
    }

    // ========== Balance-delta accounting ==========

    function test_mintRecordsAmountActuallyReceivedForFeeOnTransferAsset() public {
        MockFeeOnTransferToken skimmed =
            new MockFeeOnTransferToken("Skimmed Test Stock", "tSKIM", 100, makeAddr("feeSink"));

        address[] memory list = new address[](1);
        list[0] = address(skimmed);
        PackCustody skimPacks = new PackCustody(admin, list);

        skimmed.mint(creator, 1000e18);
        vm.prank(creator);
        skimmed.approve(address(skimPacks), type(uint256).max);

        (address[] memory assets, uint256[] memory amounts) = _single(address(skimmed), 100e18);
        vm.prank(creator);
        uint256 tokenId = skimPacks.mint(assets, amounts);

        // 1% skim: custody received 99, and the recorded basket says 99 rather than 100.
        assertEq(skimmed.balanceOf(address(skimPacks)), 99e18);
        assertEq(skimPacks.basketAmountOf(tokenId, address(skimmed)), 99e18);
    }

    function test_mintRevertsWhenNothingIsReceived() public {
        MockFeeOnTransferToken confiscatory =
            new MockFeeOnTransferToken("Confiscatory", "tGONE", 10_000, makeAddr("feeSink"));

        address[] memory list = new address[](1);
        list[0] = address(confiscatory);
        PackCustody gonePacks = new PackCustody(admin, list);

        confiscatory.mint(creator, 1000e18);
        vm.prank(creator);
        confiscatory.approve(address(gonePacks), type(uint256).max);

        (address[] memory assets, uint256[] memory amounts) = _single(address(confiscatory), 100e18);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.NoAssetsReceived.selector, address(confiscatory)));
        vm.prank(creator);
        gonePacks.mint(assets, amounts);
    }

    function test_donatedAssetsAreNotRecordedInAnyBasket() public {
        uint256 tokenId = _mintDefaultPack(creator);

        vm.prank(stranger);
        amzn.transfer(address(packs), 500e18);

        assertEq(packs.basketAmountOf(tokenId, address(amzn)), 2e18);
        assertGt(amzn.balanceOf(address(packs)), packs.basketAmountOf(tokenId, address(amzn)));
    }

    // ========== Views ==========

    function test_basketOfUnknownPackIsEmpty() public view {
        assertEq(packs.basketOf(999).length, 0);
        assertEq(packs.basketAssetsOf(999).length, 0);
        assertEq(packs.basketAmountOf(999, address(amzn)), 0);
    }

    function test_basketAssetsOfListsDistinctAssetsInDepositOrder() public {
        uint256 tokenId = _mintDefaultPack(creator);

        address[] memory assets = packs.basketAssetsOf(tokenId);
        assertEq(assets.length, 3);
        assertEq(assets[0], address(amzn));
        assertEq(assets[1], address(nflx));
        assertEq(assets[2], address(pltr));
    }
}
