// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {PackCustody} from "../src/PackCustody.sol";
import {MockStockToken} from "./mocks/MockStockToken.sol";
import {PackCustodyFixture} from "./helpers/PackCustodyFixture.sol";

/// @notice The whitelist governs deposits only. These tests pin that boundary: an admin can
///         change what may enter custody, and can never change what is already in it.
contract PackCustodyWhitelistTest is PackCustodyFixture {
    event AssetWhitelisted(address indexed asset);
    event AssetRemovedFromWhitelist(address indexed asset);

    address internal whitelistAdmin = makeAddr("whitelistAdmin");

    function setUp() public override {
        super.setUp();

        // Read the role before pranking: a view call would otherwise consume the prank.
        bytes32 role = packs.WHITELIST_ADMIN_ROLE();
        vm.prank(admin);
        packs.grantRole(role, whitelistAdmin);
    }

    // ========== Administration ==========

    function test_whitelistAdminCanAddAsset() public {
        vm.expectEmit(true, false, false, false, address(packs));
        emit AssetWhitelisted(address(offList));

        vm.prank(whitelistAdmin);
        packs.addAsset(address(offList));

        assertTrue(packs.isWhitelisted(address(offList)));
        assertEq(packs.whitelistedAssets().length, 6);
    }

    function test_whitelistAdminCanRemoveAsset() public {
        vm.expectEmit(true, false, false, false, address(packs));
        emit AssetRemovedFromWhitelist(address(nflx));

        vm.prank(whitelistAdmin);
        packs.removeAsset(address(nflx));

        assertFalse(packs.isWhitelisted(address(nflx)));
        assertEq(packs.whitelistedAssets().length, 4);
    }

    function test_removedAssetIsAbsentFromWhitelistedAssets() public {
        vm.prank(whitelistAdmin);
        packs.removeAsset(address(nflx));

        address[] memory listed = packs.whitelistedAssets();
        for (uint256 i; i < listed.length; ++i) {
            assertTrue(listed[i] != address(nflx));
        }
    }

    function test_assetCanBeReAddedAfterRemoval() public {
        vm.startPrank(whitelistAdmin);
        packs.removeAsset(address(nflx));
        packs.addAsset(address(nflx));
        vm.stopPrank();

        assertTrue(packs.isWhitelisted(address(nflx)));
        assertEq(packs.whitelistedAssets().length, 5);
    }

    function test_addRevertsOnAlreadyWhitelistedAsset() public {
        vm.expectRevert(abi.encodeWithSelector(PackCustody.AlreadyWhitelisted.selector, address(amzn)));
        vm.prank(whitelistAdmin);
        packs.addAsset(address(amzn));
    }

    function test_addRevertsOnZeroAddress() public {
        vm.expectRevert(PackCustody.ZeroAddress.selector);
        vm.prank(whitelistAdmin);
        packs.addAsset(address(0));
    }

    function test_removeRevertsOnUnlistedAsset() public {
        vm.expectRevert(abi.encodeWithSelector(PackCustody.AssetNotWhitelisted.selector, address(offList)));
        vm.prank(whitelistAdmin);
        packs.removeAsset(address(offList));
    }

    // ========== Access control ==========

    function test_nonAdminCannotAddAsset() public {
        bytes32 role = packs.WHITELIST_ADMIN_ROLE();

        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        vm.prank(stranger);
        packs.addAsset(address(offList));
    }

    function test_nonAdminCannotRemoveAsset() public {
        bytes32 role = packs.WHITELIST_ADMIN_ROLE();

        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        vm.prank(stranger);
        packs.removeAsset(address(amzn));
    }

    function test_defaultAdminCannotAdministerWhitelistWithoutRole() public {
        bytes32 role = packs.WHITELIST_ADMIN_ROLE();

        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, admin, role));
        vm.prank(admin);
        packs.addAsset(address(offList));
    }

    function test_revokedAdminCannotAdministerWhitelist() public {
        bytes32 role = packs.WHITELIST_ADMIN_ROLE();

        vm.prank(admin);
        packs.revokeRole(role, whitelistAdmin);

        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, whitelistAdmin, role)
        );
        vm.prank(whitelistAdmin);
        packs.addAsset(address(offList));
    }

    // ========== Entry control only ==========

    function test_addedAssetBecomesMintable() public {
        vm.prank(whitelistAdmin);
        packs.addAsset(address(offList));

        (address[] memory assets, uint256[] memory amounts) = _single(address(offList), 4e18);
        vm.prank(creator);
        uint256 tokenId = packs.mint(assets, amounts);

        assertEq(packs.basketAmountOf(tokenId, address(offList)), 4e18);
    }

    function test_removedAssetCannotBeMinted() public {
        vm.prank(whitelistAdmin);
        packs.removeAsset(address(nflx));

        (address[] memory assets, uint256[] memory amounts) = _single(address(nflx), 1e8);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.AssetNotWhitelisted.selector, address(nflx)));
        vm.prank(creator);
        packs.mint(assets, amounts);
    }

    function test_removalLeavesExistingBasketsIntact() public {
        uint256 tokenId = _mintDefaultPack(creator);

        vm.prank(whitelistAdmin);
        packs.removeAsset(address(nflx));

        PackCustody.BasketEntry[] memory basket = packs.basketOf(tokenId);
        assertEq(basket.length, 3);
        assertEq(packs.basketAmountOf(tokenId, address(nflx)), 5e8);
        assertEq(nflx.balanceOf(address(packs)), 5e8);
    }

    function test_removalDoesNotAffectOtherAssetsInTheSameBasket() public {
        uint256 tokenId = _mintDefaultPack(creator);

        vm.prank(whitelistAdmin);
        packs.removeAsset(address(nflx));

        assertEq(packs.basketAmountOf(tokenId, address(amzn)), 2e18);
        assertEq(packs.basketAmountOf(tokenId, address(pltr)), 7e6);
        assertTrue(packs.isWhitelisted(address(amzn)));
        assertTrue(packs.isWhitelisted(address(pltr)));
    }

    function test_removalDoesNotAffectPackOwnership() public {
        uint256 tokenId = _mintDefaultPack(creator);

        vm.prank(whitelistAdmin);
        packs.removeAsset(address(nflx));

        assertEq(packs.ownerOf(tokenId), creator);
        assertEq(packs.creatorOf(tokenId), creator);
    }

    function test_emptyingTheWhitelistBlocksMintingButKeepsCustodyRecorded() public {
        uint256 tokenId = _mintDefaultPack(creator);

        vm.startPrank(whitelistAdmin);
        for (uint256 i; i < whitelist.length; ++i) {
            packs.removeAsset(whitelist[i]);
        }
        vm.stopPrank();

        assertEq(packs.whitelistedAssets().length, 0);

        (address[] memory assets, uint256[] memory amounts) = _single(address(amzn), 1e18);
        vm.expectRevert(abi.encodeWithSelector(PackCustody.AssetNotWhitelisted.selector, address(amzn)));
        vm.prank(creator);
        packs.mint(assets, amounts);

        assertEq(packs.basketOf(tokenId).length, 3);
        assertEq(packs.basketAmountOf(tokenId, address(amzn)), 2e18);
    }
}
