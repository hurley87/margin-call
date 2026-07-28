// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PackCustody} from "../src/PackCustody.sol";
import {MockReentrantToken} from "./mocks/MockReentrantToken.sol";
import {PackCustodyFixture} from "./helpers/PackCustodyFixture.sol";

/// @notice Unwrap is the holder's exit once a Pack has left its creator — the disclosed right
///         that makes a ripped or purchased Pack worth holding.
contract PackCustodyUnwrapTest is PackCustodyFixture {
    event PackUnwrapped(uint256 indexed tokenId, address indexed holder, address[] assets, uint256[] amounts);

    uint256 internal packId;

    function setUp() public override {
        super.setUp();
        packId = _mintDefaultPack(creator);

        vm.prank(creator);
        packs.transferFrom(creator, buyer, packId);
    }

    // ========== Unwrapping ==========

    function test_holderReceivesTheEntireBasketWithNoDeduction() public {
        uint256 amznBefore = amzn.balanceOf(buyer);
        uint256 nflxBefore = nflx.balanceOf(buyer);
        uint256 pltrBefore = pltr.balanceOf(buyer);

        vm.prank(buyer);
        packs.unwrap(packId);

        assertEq(amzn.balanceOf(buyer), amznBefore + 2e18);
        assertEq(nflx.balanceOf(buyer), nflxBefore + 5e8);
        assertEq(pltr.balanceOf(buyer), pltrBefore + 7e6);
    }

    function test_unwrapDrainsCustodyForThatPack() public {
        vm.prank(buyer);
        packs.unwrap(packId);

        assertEq(amzn.balanceOf(address(packs)), 0);
        assertEq(nflx.balanceOf(address(packs)), 0);
        assertEq(pltr.balanceOf(address(packs)), 0);
    }

    function test_unwrapBurnsThePackAndClearsTheBasket() public {
        vm.prank(buyer);
        packs.unwrap(packId);

        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, packId));
        packs.ownerOf(packId);

        assertEq(packs.basketOf(packId).length, 0);
        assertEq(packs.basketAmountOf(packId, address(amzn)), 0);
        assertEq(packs.creatorOf(packId), address(0));
    }

    function test_unwrapEmitsPackUnwrappedWithTheFullBasket() public {
        (address[] memory assets, uint256[] memory amounts) = _defaultBasket();

        vm.expectEmit(true, true, false, true, address(packs));
        emit PackUnwrapped(packId, buyer, assets, amounts);

        vm.prank(buyer);
        packs.unwrap(packId);
    }

    function test_unwrapIncludesAssetsToppedUpBeforeTransfer() public {
        uint256 freshPack = _mintDefaultPack(creator);

        (address[] memory assets, uint256[] memory amounts) = _pair(address(amzn), 1e18, address(tsla), 6e18);
        vm.startPrank(creator);
        packs.topUp(freshPack, assets, amounts);
        packs.transferFrom(creator, buyer, freshPack);
        vm.stopPrank();

        uint256 amznBefore = amzn.balanceOf(buyer);
        uint256 tslaBefore = tsla.balanceOf(buyer);

        vm.prank(buyer);
        packs.unwrap(freshPack);

        assertEq(amzn.balanceOf(buyer), amznBefore + 3e18);
        assertEq(tsla.balanceOf(buyer), tslaBefore + 6e18);
    }

    function test_onlyTheCurrentHolderUnwrapsAfterAChainOfTransfers() public {
        vm.prank(buyer);
        packs.transferFrom(buyer, stranger, packId);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.NotPackHolder.selector, packId, buyer));
        vm.prank(buyer);
        packs.unwrap(packId);

        uint256 amznBefore = amzn.balanceOf(stranger);
        vm.prank(stranger);
        packs.unwrap(packId);

        assertEq(amzn.balanceOf(stranger), amznBefore + 2e18);
    }

    function test_theBasketFollowsThePackNotTheCreator() public {
        uint256 creatorAmznBefore = amzn.balanceOf(creator);

        vm.prank(buyer);
        packs.unwrap(packId);

        assertEq(amzn.balanceOf(creator), creatorAmznBefore);
    }

    // ========== Authorization ==========

    function test_creatorCannotUnwrapWhileListed() public {
        uint256 listedPack = _mintDefaultPack(creator);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.PackStillListed.selector, listedPack));
        vm.prank(creator);
        packs.unwrap(listedPack);
    }

    function test_formerCreatorCannotUnwrapAfterTransfer() public {
        vm.expectRevert(abi.encodeWithSelector(PackCustody.NotPackHolder.selector, packId, creator));
        vm.prank(creator);
        packs.unwrap(packId);
    }

    function test_nonHolderCannotUnwrap() public {
        vm.expectRevert(abi.encodeWithSelector(PackCustody.NotPackHolder.selector, packId, stranger));
        vm.prank(stranger);
        packs.unwrap(packId);
    }

    function test_approvedOperatorCannotUnwrap() public {
        vm.prank(buyer);
        packs.approve(stranger, packId);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.NotPackHolder.selector, packId, stranger));
        vm.prank(stranger);
        packs.unwrap(packId);
    }

    function test_unwrapRevertsOnUnknownPack() public {
        vm.expectRevert(abi.encodeWithSelector(PackCustody.NotPackHolder.selector, 999, buyer));
        vm.prank(buyer);
        packs.unwrap(999);
    }

    function test_unwrapCannotRunTwice() public {
        vm.startPrank(buyer);
        packs.unwrap(packId);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.NotPackHolder.selector, packId, buyer));
        packs.unwrap(packId);
        vm.stopPrank();
    }

    // ========== The two exits converge ==========

    function test_creatorWhoReacquiresAPackUnwrapsRatherThanRedeems() public {
        vm.prank(buyer);
        packs.transferFrom(buyer, creator, packId);

        // Unlisting is one way, so the creator's exit is now unwrap, not delist-and-redeem.
        vm.expectRevert(abi.encodeWithSelector(PackCustody.PackNotListed.selector, packId));
        vm.prank(creator);
        packs.delistAndRedeem(packId);

        uint256 amznBefore = amzn.balanceOf(creator);
        vm.prank(creator);
        packs.unwrap(packId);

        assertEq(amzn.balanceOf(creator), amznBefore + 2e18);
    }

    function test_bothExitsReleaseIdenticalValue() public {
        uint256 redeemedPack = _mintDefaultPack(otherCreator);

        uint256 unwrapBefore = amzn.balanceOf(buyer);
        vm.prank(buyer);
        packs.unwrap(packId);
        uint256 unwrapped = amzn.balanceOf(buyer) - unwrapBefore;

        uint256 redeemBefore = amzn.balanceOf(otherCreator);
        vm.prank(otherCreator);
        packs.delistAndRedeem(redeemedPack);
        uint256 redeemed = amzn.balanceOf(otherCreator) - redeemBefore;

        assertEq(unwrapped, redeemed);
    }

    // ========== Whitelist independence ==========

    function test_deWhitelistedAssetIsStillUnwrappedInFull() public {
        bytes32 role = packs.WHITELIST_ADMIN_ROLE();
        vm.startPrank(admin);
        packs.grantRole(role, admin);
        packs.removeAsset(address(pltr));
        vm.stopPrank();

        uint256 pltrBefore = pltr.balanceOf(buyer);
        vm.prank(buyer);
        packs.unwrap(packId);

        assertEq(pltr.balanceOf(buyer), pltrBefore + 7e6);
    }

    // ========== Reentrancy ==========

    function test_unwrapRejectsReentrancyFromAHostileAsset() public {
        MockReentrantToken hostile = new MockReentrantToken("Hostile", "tEVIL");

        address[] memory list = new address[](1);
        list[0] = address(hostile);
        PackCustody hostilePacks = new PackCustody(admin, list);

        hostile.mint(creator, 100e18);
        vm.prank(creator);
        hostile.approve(address(hostilePacks), type(uint256).max);

        (address[] memory assets, uint256[] memory amounts) = _single(address(hostile), 10e18);
        vm.startPrank(creator);
        uint256 tokenId = hostilePacks.mint(assets, amounts);
        hostilePacks.transferFrom(creator, buyer, tokenId);
        vm.stopPrank();

        hostile.arm(address(hostilePacks), abi.encodeCall(PackCustody.unwrap, (tokenId)));

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        vm.prank(buyer);
        hostilePacks.unwrap(tokenId);

        assertEq(hostilePacks.ownerOf(tokenId), buyer);
        assertEq(hostilePacks.basketAmountOf(tokenId, address(hostile)), 10e18);
        assertEq(hostile.balanceOf(address(hostilePacks)), 10e18);
    }
}
