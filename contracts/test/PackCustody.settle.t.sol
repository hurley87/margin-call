// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {PackCustody} from "../src/PackCustody.sol";
import {PackCustodyFixture} from "./helpers/PackCustodyFixture.sol";

/// @notice Role-gated settlement: RipEngine hands a listed Pack to a recipient without moving
///         basket ERC-20s — ownership + the one-way unlisted latch only.
contract PackCustodySettleTest is PackCustodyFixture {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event PackUnlisted(uint256 indexed tokenId);

    uint256 internal packId;

    function setUp() public override {
        super.setUp();
        _grantRipEngine();
        packId = _mintDefaultPack(creator);
    }

    // ========== Authorization ==========

    function test_unauthorizedCallerReverts() public {
        bytes32 role = packs.RIP_ENGINE_ROLE();

        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        vm.prank(stranger);
        packs.releaseToRecipient(packId, buyer);
    }

    function test_adminIsNotImplicitlyAuthorized() public {
        bytes32 role = packs.RIP_ENGINE_ROLE();

        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, admin, role));
        vm.prank(admin);
        packs.releaseToRecipient(packId, buyer);
    }

    function test_roleIsGrantableAndRevocableByAdmin() public {
        address nextEngine = makeAddr("nextEngine");
        bytes32 role = packs.RIP_ENGINE_ROLE();

        vm.prank(admin);
        packs.grantRole(role, nextEngine);

        vm.prank(nextEngine);
        packs.releaseToRecipient(packId, buyer);
        assertEq(packs.ownerOf(packId), buyer);

        uint256 listedPack = _mintDefaultPack(creator);

        vm.prank(admin);
        packs.revokeRole(role, nextEngine);

        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, nextEngine, role)
        );
        vm.prank(nextEngine);
        packs.releaseToRecipient(listedPack, buyer);
    }

    function test_ripEngineRoleIsNotGrantedAtConstruction() public {
        PackCustody fresh = new PackCustody(admin, whitelist);
        assertFalse(fresh.hasRole(fresh.RIP_ENGINE_ROLE(), admin));
    }

    // ========== Happy path ==========

    function test_releaseMovesPackToRecipientAndUnlistsWithoutMovingTokens() public {
        uint256 custodyAmzn = amzn.balanceOf(address(packs));
        uint256 custodyNflx = nflx.balanceOf(address(packs));
        uint256 custodyPltr = pltr.balanceOf(address(packs));
        uint256 buyerAmzn = amzn.balanceOf(buyer);

        vm.prank(ripEngine);
        packs.releaseToRecipient(packId, buyer);

        assertEq(packs.ownerOf(packId), buyer);
        assertFalse(packs.isListed(packId));
        assertEq(packs.basketAmountOf(packId, address(amzn)), 2e18);
        assertEq(packs.basketAmountOf(packId, address(nflx)), 5e8);
        assertEq(packs.basketAmountOf(packId, address(pltr)), 7e6);
        assertEq(packs.basketOf(packId).length, 3);

        assertEq(amzn.balanceOf(address(packs)), custodyAmzn);
        assertEq(nflx.balanceOf(address(packs)), custodyNflx);
        assertEq(pltr.balanceOf(address(packs)), custodyPltr);
        assertEq(amzn.balanceOf(buyer), buyerAmzn);
    }

    function test_releaseEmitsTransferAndPackUnlisted() public {
        vm.expectEmit(true, true, true, true, address(packs));
        emit Transfer(creator, buyer, packId);
        vm.expectEmit(true, false, false, true, address(packs));
        emit PackUnlisted(packId);

        vm.prank(ripEngine);
        packs.releaseToRecipient(packId, buyer);
    }

    // ========== Settle-once ==========

    function test_secondReleaseRevertsPackNotListed() public {
        vm.prank(ripEngine);
        packs.releaseToRecipient(packId, buyer);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.PackNotListed.selector, packId));
        vm.prank(ripEngine);
        packs.releaseToRecipient(packId, stranger);
    }

    function test_alreadyTransferredPackCannotBeSettled() public {
        vm.prank(creator);
        packs.transferFrom(creator, buyer, packId);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.PackNotListed.selector, packId));
        vm.prank(ripEngine);
        packs.releaseToRecipient(packId, stranger);
    }

    // ========== Edge cases ==========

    function test_zeroAddressRecipientReverts() public {
        vm.expectRevert(PackCustody.ZeroAddress.selector);
        vm.prank(ripEngine);
        packs.releaseToRecipient(packId, address(0));
    }

    function test_selfReleaseReverts() public {
        vm.expectRevert(abi.encodeWithSelector(PackCustody.SelfRelease.selector, packId));
        vm.prank(ripEngine);
        packs.releaseToRecipient(packId, creator);
    }

    function test_unknownTokenIdReverts() public {
        uint256 missing = 999;

        vm.expectRevert(abi.encodeWithSelector(PackCustody.PackNotListed.selector, missing));
        vm.prank(ripEngine);
        packs.releaseToRecipient(missing, buyer);
    }

    function test_burnedPackCannotBeSettled() public {
        vm.prank(creator);
        packs.delistAndRedeem(packId);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.PackNotListed.selector, packId));
        vm.prank(ripEngine);
        packs.releaseToRecipient(packId, buyer);
    }

    // ========== Post-settle exits ==========

    function test_recipientCanUnwrapAfterRelease() public {
        uint256 buyerAmzn = amzn.balanceOf(buyer);
        uint256 buyerNflx = nflx.balanceOf(buyer);
        uint256 buyerPltr = pltr.balanceOf(buyer);

        vm.prank(ripEngine);
        packs.releaseToRecipient(packId, buyer);

        vm.prank(buyer);
        packs.unwrap(packId);

        assertEq(amzn.balanceOf(buyer), buyerAmzn + 2e18);
        assertEq(nflx.balanceOf(buyer), buyerNflx + 5e8);
        assertEq(pltr.balanceOf(buyer), buyerPltr + 7e6);
        assertEq(amzn.balanceOf(address(packs)), 0);

        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, packId));
        packs.ownerOf(packId);
    }

    function test_creatorCannotRedeemOrTopUpAfterRelease() public {
        vm.prank(ripEngine);
        packs.releaseToRecipient(packId, buyer);

        vm.expectRevert(abi.encodeWithSelector(PackCustody.PackNotListed.selector, packId));
        vm.prank(creator);
        packs.delistAndRedeem(packId);

        (address[] memory assets, uint256[] memory amounts) = _single(address(amzn), 1e18);
        vm.expectRevert(abi.encodeWithSelector(PackCustody.PackNotListed.selector, packId));
        vm.prank(creator);
        packs.topUp(packId, assets, amounts);
    }
}
