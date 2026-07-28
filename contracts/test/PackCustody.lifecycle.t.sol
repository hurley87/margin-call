// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {PackCustody} from "../src/PackCustody.sol";
import {PackCustodyFixture} from "./helpers/PackCustodyFixture.sol";

/// @notice The two journeys a Pack can take, driven end to end through the external ABI and
///         asserted only on what an explorer or a `cast` user could see.
contract PackCustodyLifecycleTest is PackCustodyFixture {
    // ========== mint -> top-up -> redeem ==========

    function test_lifecycleMintTopUpRedeem() public {
        uint256 amznStart = amzn.balanceOf(creator);
        uint256 nflxStart = nflx.balanceOf(creator);
        uint256 pltrStart = pltr.balanceOf(creator);
        uint256 tslaStart = tsla.balanceOf(creator);

        // Mint a fully funded Pack.
        (address[] memory assets, uint256[] memory amounts) = _defaultBasket();
        vm.prank(creator);
        uint256 tokenId = packs.mint(assets, amounts);

        assertEq(packs.ownerOf(tokenId), creator);
        assertTrue(packs.isListed(tokenId));
        assertEq(packs.basketOf(tokenId).length, 3);
        assertEq(amzn.balanceOf(creator), amznStart - 2e18);

        // Top up: one existing asset, one new one.
        (address[] memory addAssets, uint256[] memory addAmounts) = _pair(address(amzn), 4e18, address(tsla), 9e18);
        vm.prank(creator);
        packs.topUp(tokenId, addAssets, addAmounts);

        assertEq(packs.basketOf(tokenId).length, 4);
        assertEq(packs.basketAmountOf(tokenId, address(amzn)), 6e18);
        assertEq(packs.basketAmountOf(tokenId, address(tsla)), 9e18);
        assertTrue(packs.isListed(tokenId));

        // Delist and redeem: everything comes back, nothing is skimmed.
        vm.prank(creator);
        packs.delistAndRedeem(tokenId);

        assertEq(amzn.balanceOf(creator), amznStart);
        assertEq(nflx.balanceOf(creator), nflxStart);
        assertEq(pltr.balanceOf(creator), pltrStart);
        assertEq(tsla.balanceOf(creator), tslaStart);

        assertEq(amzn.balanceOf(address(packs)), 0);
        assertEq(tsla.balanceOf(address(packs)), 0);

        assertFalse(packs.isListed(tokenId));
        assertEq(packs.basketOf(tokenId).length, 0);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, tokenId));
        packs.ownerOf(tokenId);
    }

    // ========== mint -> transfer -> unwrap ==========

    function test_lifecycleMintTransferUnwrap() public {
        uint256 creatorAmznStart = amzn.balanceOf(creator);
        uint256 buyerAmznStart = amzn.balanceOf(buyer);
        uint256 buyerNflxStart = nflx.balanceOf(buyer);
        uint256 buyerPltrStart = pltr.balanceOf(buyer);

        (address[] memory assets, uint256[] memory amounts) = _defaultBasket();
        vm.prank(creator);
        uint256 tokenId = packs.mint(assets, amounts);

        // Settlement moves the Pack to its new holder; the basket follows the token.
        vm.prank(creator);
        packs.transferFrom(creator, buyer, tokenId);

        assertEq(packs.ownerOf(tokenId), buyer);
        assertFalse(packs.isListed(tokenId));
        assertEq(packs.basketOf(tokenId).length, 3);
        assertEq(packs.basketAmountOf(tokenId, address(amzn)), 2e18);

        // The creator keeps the assets they spent; they do not come back.
        assertEq(amzn.balanceOf(creator), creatorAmznStart - 2e18);

        // The holder unwraps the full recorded basket, at zero fee.
        vm.prank(buyer);
        packs.unwrap(tokenId);

        assertEq(amzn.balanceOf(buyer), buyerAmznStart + 2e18);
        assertEq(nflx.balanceOf(buyer), buyerNflxStart + 5e8);
        assertEq(pltr.balanceOf(buyer), buyerPltrStart + 7e6);

        assertEq(amzn.balanceOf(address(packs)), 0);
        assertEq(packs.basketOf(tokenId).length, 0);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, tokenId));
        packs.ownerOf(tokenId);
    }

    // ========== Concurrent Packs ==========

    function test_manyPacksMoveThroughBothPathsWithoutInterference() public {
        uint256 keptPack = _mintDefaultPack(creator);
        uint256 redeemedPack = _mintDefaultPack(creator);
        uint256 soldPack = _mintDefaultPack(otherCreator);

        assertEq(amzn.balanceOf(address(packs)), 6e18);

        vm.prank(creator);
        packs.delistAndRedeem(redeemedPack);

        vm.prank(otherCreator);
        packs.transferFrom(otherCreator, buyer, soldPack);

        vm.prank(buyer);
        packs.unwrap(soldPack);

        // Only the untouched Pack's assets remain in custody.
        assertEq(amzn.balanceOf(address(packs)), 2e18);
        assertEq(nflx.balanceOf(address(packs)), 5e8);
        assertEq(pltr.balanceOf(address(packs)), 7e6);

        assertTrue(packs.isListed(keptPack));
        assertEq(packs.basketAmountOf(keptPack, address(amzn)), 2e18);
        assertEq(packs.balanceOf(creator), 1);
    }
}
