// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PackCustody} from "../src/PackCustody.sol";
import {MockReentrantToken} from "./mocks/MockReentrantToken.sol";
import {PackCustodyFixture} from "./helpers/PackCustodyFixture.sol";

/// @notice Delist-and-redeem is the creator's exit. It returns everything and charges nothing.
contract PackCustodyRedeemTest is PackCustodyFixture {
    event PackRedeemed(uint256 indexed tokenId, address indexed creator, address[] assets, uint256[] amounts);

    uint256 internal packId;

    function setUp() public override {
        super.setUp();
        packId = _mintDefaultPack(creator);
    }

    // ========== Redemption ==========

    function test_redeemReturnsTheEntireBasketWithNoDeduction() public {
        uint256 amznBefore = amzn.balanceOf(creator);
        uint256 nflxBefore = nflx.balanceOf(creator);
        uint256 pltrBefore = pltr.balanceOf(creator);

        vm.prank(creator);
        packs.delistAndRedeem(packId);

        assertEq(amzn.balanceOf(creator), amznBefore + 2e18);
        assertEq(nflx.balanceOf(creator), nflxBefore + 5e8);
        assertEq(pltr.balanceOf(creator), pltrBefore + 7e6);
    }

    function test_redeemRestoresTheCreatorsPreMintBalancesExactly() public {
        uint256 amznBefore = amzn.balanceOf(otherCreator);
        uint256 nflxBefore = nflx.balanceOf(otherCreator);

        uint256 tokenId = _mintDefaultPack(otherCreator);

        (address[] memory assets, uint256[] memory amounts) = _single(address(amzn), 11e18);
        vm.startPrank(otherCreator);
        packs.topUp(tokenId, assets, amounts);
        packs.delistAndRedeem(tokenId);
        vm.stopPrank();

        assertEq(amzn.balanceOf(otherCreator), amznBefore);
        assertEq(nflx.balanceOf(otherCreator), nflxBefore);
    }

    function test_redeemDrainsCustodyForThatPack() public {
        vm.prank(creator);
        packs.delistAndRedeem(packId);

        assertEq(amzn.balanceOf(address(packs)), 0);
        assertEq(nflx.balanceOf(address(packs)), 0);
        assertEq(pltr.balanceOf(address(packs)), 0);
    }

    function test_redeemBurnsThePack() public {
        vm.prank(creator);
        packs.delistAndRedeem(packId);

        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, packId));
        packs.ownerOf(packId);

        assertEq(packs.balanceOf(creator), 0);
        assertFalse(packs.isListed(packId));
    }

    function test_redeemClearsTheRecordedBasket() public {
        vm.prank(creator);
        packs.delistAndRedeem(packId);

        assertEq(packs.basketOf(packId).length, 0);
        assertEq(packs.basketAssetsOf(packId).length, 0);
        assertEq(packs.basketAmountOf(packId, address(amzn)), 0);
        assertEq(packs.creatorOf(packId), address(0));
    }

    function test_redeemIncludesToppedUpAssets() public {
        (address[] memory assets, uint256[] memory amounts) = _pair(address(amzn), 1e18, address(tsla), 4e18);
        vm.prank(creator);
        packs.topUp(packId, assets, amounts);

        uint256 amznBefore = amzn.balanceOf(creator);
        uint256 tslaBefore = tsla.balanceOf(creator);

        vm.prank(creator);
        packs.delistAndRedeem(packId);

        assertEq(amzn.balanceOf(creator), amznBefore + 3e18);
        assertEq(tsla.balanceOf(creator), tslaBefore + 4e18);
    }

    function test_redeemEmitsPackRedeemedWithTheFullBasket() public {
        (address[] memory assets, uint256[] memory amounts) = _defaultBasket();

        vm.expectEmit(true, true, false, true, address(packs));
        emit PackRedeemed(packId, creator, assets, amounts);

        vm.prank(creator);
        packs.delistAndRedeem(packId);
    }

    function test_redeemLeavesOtherPacksUntouched() public {
        uint256 otherPack = _mintDefaultPack(otherCreator);

        vm.prank(creator);
        packs.delistAndRedeem(packId);

        assertEq(packs.basketAmountOf(otherPack, address(amzn)), 2e18);
        assertEq(amzn.balanceOf(address(packs)), 2e18);
        assertTrue(packs.isListed(otherPack));
    }

    function test_redeemedTokenIdIsNeverReused() public {
        vm.prank(creator);
        packs.delistAndRedeem(packId);

        uint256 next = _mintDefaultPack(creator);
        assertGt(next, packId);
    }

    // ========== Authorization ==========

    function test_nonCreatorCannotRedeem() public {
        vm.expectRevert(abi.encodeWithSelector(PackCustody.NotPackCreator.selector, packId, stranger));
        vm.prank(stranger);
        packs.delistAndRedeem(packId);
    }

    function test_approvedOperatorCannotRedeem() public {
        vm.prank(creator);
        packs.approve(stranger, packId);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.NotPackCreator.selector, packId, stranger));
        vm.prank(stranger);
        packs.delistAndRedeem(packId);
    }

    function test_creatorCannotRedeemAfterTransfer() public {
        vm.prank(creator);
        packs.transferFrom(creator, buyer, packId);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.PackNotListed.selector, packId));
        vm.prank(creator);
        packs.delistAndRedeem(packId);
    }

    function test_newHolderCannotRedeem() public {
        vm.prank(creator);
        packs.transferFrom(creator, buyer, packId);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.PackNotListed.selector, packId));
        vm.prank(buyer);
        packs.delistAndRedeem(packId);
    }

    function test_redeemRevertsOnUnknownPack() public {
        vm.expectRevert(abi.encodeWithSelector(PackCustody.PackNotListed.selector, 999));
        vm.prank(creator);
        packs.delistAndRedeem(999);
    }

    function test_redeemCannotRunTwice() public {
        vm.startPrank(creator);
        packs.delistAndRedeem(packId);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.PackNotListed.selector, packId));
        packs.delistAndRedeem(packId);
        vm.stopPrank();
    }

    function test_toppingUpAfterRedeemReverts() public {
        vm.prank(creator);
        packs.delistAndRedeem(packId);

        (address[] memory assets, uint256[] memory amounts) = _single(address(amzn), 1e18);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.PackNotListed.selector, packId));
        vm.prank(creator);
        packs.topUp(packId, assets, amounts);
    }

    // ========== Whitelist independence ==========

    function test_deWhitelistedAssetIsStillRedeemedInFull() public {
        bytes32 role = packs.WHITELIST_ADMIN_ROLE();
        vm.startPrank(admin);
        packs.grantRole(role, admin);
        packs.removeAsset(address(nflx));
        vm.stopPrank();

        assertFalse(packs.isWhitelisted(address(nflx)));

        uint256 nflxBefore = nflx.balanceOf(creator);
        vm.prank(creator);
        packs.delistAndRedeem(packId);

        assertEq(nflx.balanceOf(creator), nflxBefore + 5e8);
    }

    function test_redeemWorksWithAnEmptiedWhitelist() public {
        bytes32 role = packs.WHITELIST_ADMIN_ROLE();
        vm.startPrank(admin);
        packs.grantRole(role, admin);
        for (uint256 i; i < whitelist.length; ++i) {
            packs.removeAsset(whitelist[i]);
        }
        vm.stopPrank();

        uint256 amznBefore = amzn.balanceOf(creator);
        vm.prank(creator);
        packs.delistAndRedeem(packId);

        assertEq(amzn.balanceOf(creator), amznBefore + 2e18);
        assertEq(amzn.balanceOf(address(packs)), 0);
    }

    // ========== Reentrancy ==========

    function test_redeemRejectsReentrancyFromAHostileAsset() public {
        MockReentrantToken hostile = new MockReentrantToken("Hostile", "tEVIL");

        address[] memory list = new address[](1);
        list[0] = address(hostile);
        PackCustody hostilePacks = new PackCustody(admin, list);

        hostile.mint(creator, 100e18);
        vm.prank(creator);
        hostile.approve(address(hostilePacks), type(uint256).max);

        (address[] memory assets, uint256[] memory amounts) = _single(address(hostile), 10e18);
        vm.prank(creator);
        uint256 tokenId = hostilePacks.mint(assets, amounts);

        hostile.arm(address(hostilePacks), abi.encodeCall(PackCustody.delistAndRedeem, (tokenId)));

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        vm.prank(creator);
        hostilePacks.delistAndRedeem(tokenId);

        // The whole attempt reverted, so the Pack and its basket are exactly as they were.
        assertEq(hostilePacks.ownerOf(tokenId), creator);
        assertEq(hostilePacks.basketAmountOf(tokenId, address(hostile)), 10e18);
        assertEq(hostile.balanceOf(address(hostilePacks)), 10e18);
    }
}
