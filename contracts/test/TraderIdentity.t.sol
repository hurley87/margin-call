// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {TraderIdentity} from "../src/TraderIdentity.sol";

contract TraderIdentityTest is Test {
    TraderIdentity public identity;

    address house = address(this);
    address manager = makeAddr("manager");
    address buyer = makeAddr("buyer");
    address attacker = makeAddr("attacker");

    string constant BASE_URI = "https://margincall.test/api/floor/trader/";

    event TraderCreated(uint256 indexed tokenId, address indexed traderOwner);
    event AuthorityEpochAdvanced(
        uint256 indexed tokenId, address indexed previousOwner, address indexed newOwner, uint64 epoch
    );
    event TraderClaimed(uint256 indexed tokenId, address indexed traderOwner, uint64 epoch);

    function setUp() public {
        identity = new TraderIdentity("Margin Call Trader", "MCTRADER", BASE_URI);
    }

    function _mint(address to) internal returns (uint256) {
        vm.prank(to);
        return identity.mint(to);
    }

    function _transfer(address from, address to, uint256 tokenId) internal {
        vm.prank(from);
        identity.transferFrom(from, to, tokenId);
    }

    // ========== Creation ==========

    function test_mint_assignsOwnershipAndFirstEpoch() public {
        uint256 tokenId = _mint(manager);

        assertEq(tokenId, 1);
        assertEq(identity.ownerOf(tokenId), manager);
        assertEq(identity.authorityEpoch(tokenId), 1);
        assertEq(identity.balanceOf(manager), 1);
    }

    function test_mint_creatorNeedsNoClaim() public {
        uint256 tokenId = _mint(manager);
        assertTrue(identity.isClaimed(tokenId));
    }

    function test_mint_isPermissionlessAndCanMintToAnother() public {
        vm.prank(attacker);
        uint256 tokenId = identity.mint(manager);
        assertEq(identity.ownerOf(tokenId), manager);
    }

    function test_mint_incrementsTokenIds() public {
        assertEq(_mint(manager), 1);
        assertEq(_mint(manager), 2);
        assertEq(_mint(buyer), 3);
        assertEq(identity.totalMinted(), 3);
    }

    function test_mint_revertsZeroOwner() public {
        vm.expectRevert("Zero owner");
        identity.mint(address(0));
    }

    function test_mint_emitsTraderCreated() public {
        vm.expectEmit(true, true, false, true);
        emit TraderCreated(1, manager);
        identity.mint(manager);
    }

    // ========== Transfer advances authority ==========

    function test_transfer_advancesAuthorityEpoch() public {
        uint256 tokenId = _mint(manager);
        _transfer(manager, buyer, tokenId);

        assertEq(identity.ownerOf(tokenId), buyer);
        assertEq(identity.authorityEpoch(tokenId), 2);
    }

    function test_transfer_clearsClaim() public {
        uint256 tokenId = _mint(manager);
        _transfer(manager, buyer, tokenId);

        assertFalse(identity.isClaimed(tokenId));
    }

    function test_transfer_emitsAuthorityEpochAdvanced() public {
        uint256 tokenId = _mint(manager);

        vm.expectEmit(true, true, true, true);
        emit AuthorityEpochAdvanced(tokenId, manager, buyer, 2);
        _transfer(manager, buyer, tokenId);
    }

    function test_transfer_repeatedAdvancesEachTime() public {
        uint256 tokenId = _mint(manager);
        _transfer(manager, buyer, tokenId);
        vm.prank(buyer);
        identity.claim(tokenId);
        _transfer(buyer, attacker, tokenId);

        assertEq(identity.authorityEpoch(tokenId), 3);
        assertFalse(identity.isClaimed(tokenId));
    }

    function test_transfer_selfTransferStillAdvancesEpoch() public {
        uint256 tokenId = _mint(manager);
        _transfer(manager, manager, tokenId);

        assertEq(identity.authorityEpoch(tokenId), 2);
        assertFalse(identity.isClaimed(tokenId));
    }

    function test_transfer_epochsAreIndependentPerToken() public {
        uint256 first = _mint(manager);
        uint256 second = _mint(manager);

        _transfer(manager, buyer, first);

        assertEq(identity.authorityEpoch(first), 2);
        assertEq(identity.authorityEpoch(second), 1);
        assertTrue(identity.isClaimed(second));
    }

    function test_transfer_isPermissionlessForOwner() public {
        uint256 tokenId = _mint(manager);
        _transfer(manager, buyer, tokenId);
        assertEq(identity.ownerOf(tokenId), buyer);
    }

    function test_transfer_revertsForNonOwner() public {
        uint256 tokenId = _mint(manager);

        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721InsufficientApproval.selector, attacker, tokenId));
        identity.transferFrom(manager, attacker, tokenId);
    }

    function test_transfer_byApprovedOperatorStillAdvancesEpoch() public {
        uint256 tokenId = _mint(manager);

        vm.prank(manager);
        identity.approve(buyer, tokenId);

        vm.prank(buyer);
        identity.transferFrom(manager, buyer, tokenId);

        assertEq(identity.authorityEpoch(tokenId), 2);
        assertFalse(identity.isClaimed(tokenId));
    }

    // ========== Claim ==========

    function test_claim_restoresClaimFlag() public {
        uint256 tokenId = _mint(manager);
        _transfer(manager, buyer, tokenId);

        vm.prank(buyer);
        identity.claim(tokenId);

        assertTrue(identity.isClaimed(tokenId));
    }

    function test_claim_emitsWithCurrentEpoch() public {
        uint256 tokenId = _mint(manager);
        _transfer(manager, buyer, tokenId);

        vm.expectEmit(true, true, false, true);
        emit TraderClaimed(tokenId, buyer, 2);
        vm.prank(buyer);
        identity.claim(tokenId);
    }

    function test_claim_doesNotAdvanceEpoch() public {
        uint256 tokenId = _mint(manager);
        _transfer(manager, buyer, tokenId);

        vm.prank(buyer);
        identity.claim(tokenId);

        assertEq(identity.authorityEpoch(tokenId), 2);
    }

    function test_claim_revertsForPreviousOwner() public {
        uint256 tokenId = _mint(manager);
        _transfer(manager, buyer, tokenId);

        vm.prank(manager);
        vm.expectRevert("Not trader owner");
        identity.claim(tokenId);
    }

    function test_claim_revertsForStranger() public {
        uint256 tokenId = _mint(manager);
        _transfer(manager, buyer, tokenId);

        vm.prank(attacker);
        vm.expectRevert("Not trader owner");
        identity.claim(tokenId);
    }

    function test_claim_revertsWhenAlreadyClaimed() public {
        uint256 tokenId = _mint(manager);

        vm.prank(manager);
        vm.expectRevert("Already claimed");
        identity.claim(tokenId);
    }

    function test_claim_revertsForNonexistentTrader() public {
        vm.prank(manager);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, uint256(99)));
        identity.claim(99);
    }

    function test_claim_isRequiredAgainAfterEachTransfer() public {
        uint256 tokenId = _mint(manager);

        _transfer(manager, buyer, tokenId);
        vm.prank(buyer);
        identity.claim(tokenId);
        assertTrue(identity.isClaimed(tokenId));

        _transfer(buyer, attacker, tokenId);
        assertFalse(identity.isClaimed(tokenId));
    }

    // ========== Views ==========

    function test_traderState_returnsOwnerEpochAndClaim() public {
        uint256 tokenId = _mint(manager);
        _transfer(manager, buyer, tokenId);

        (address traderOwner, uint64 epoch, bool claimed) = identity.traderState(tokenId);
        assertEq(traderOwner, buyer);
        assertEq(epoch, 2);
        assertFalse(claimed);
    }

    function test_traderState_revertsForNonexistentTrader() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, uint256(7)));
        identity.traderState(7);
    }

    function test_authorityEpoch_isZeroForNonexistentTrader() public view {
        assertEq(identity.authorityEpoch(1234), 0);
    }

    function test_tokenURI_usesBaseURI() public {
        uint256 tokenId = _mint(manager);
        assertEq(identity.tokenURI(tokenId), string.concat(BASE_URI, "1"));
    }

    function test_tokenURI_revertsForNonexistentTrader() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, uint256(1)));
        identity.tokenURI(1);
    }

    // ========== Admin ==========

    function test_setBaseURI_updatesMetadataEndpoint() public {
        uint256 tokenId = _mint(manager);
        identity.setBaseURI("https://margincall.test/v2/");
        assertEq(identity.tokenURI(tokenId), "https://margincall.test/v2/1");
    }

    function test_setBaseURI_revertsForNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert("Not owner");
        identity.setBaseURI("https://evil.test/");
    }

    function test_setBaseURI_cannotFreezeOrRestrictTransfers() public {
        uint256 tokenId = _mint(manager);
        identity.setBaseURI("https://margincall.test/v2/");

        // Admin holds metadata only; custody stays permissionless.
        _transfer(manager, buyer, tokenId);
        assertEq(identity.ownerOf(tokenId), buyer);
    }

    function test_transferOwnership_isTwoStep() public {
        identity.transferOwnership(manager);
        assertEq(identity.owner(), house);
        assertEq(identity.pendingOwner(), manager);

        vm.prank(manager);
        identity.acceptOwnership();

        assertEq(identity.owner(), manager);
        assertEq(identity.pendingOwner(), address(0));
    }

    function test_transferOwnership_revertsZeroOwner() public {
        vm.expectRevert("Zero owner");
        identity.transferOwnership(address(0));
    }

    function test_acceptOwnership_revertsForNonPendingOwner() public {
        identity.transferOwnership(manager);

        vm.prank(attacker);
        vm.expectRevert("Not pending owner");
        identity.acceptOwnership();
    }

    // ========== Fuzz ==========

    function testFuzz_transferChainAdvancesEpochOncePerHop(uint8 hops) public {
        hops = uint8(bound(hops, 1, 32));
        uint256 tokenId = _mint(manager);

        address current = manager;
        for (uint256 i = 0; i < hops; i++) {
            address next = address(uint160(uint256(keccak256(abi.encode(i, tokenId)))));
            vm.assume(next != address(0));
            _transfer(current, next, tokenId);
            current = next;
        }

        assertEq(identity.authorityEpoch(tokenId), uint64(hops) + 1);
        assertEq(identity.ownerOf(tokenId), current);
        assertFalse(identity.isClaimed(tokenId));
    }

    function testFuzz_onlyCurrentOwnerCanClaim(address caller) public {
        uint256 tokenId = _mint(manager);
        _transfer(manager, buyer, tokenId);

        vm.assume(caller != buyer);
        vm.prank(caller);
        vm.expectRevert("Not trader owner");
        identity.claim(tokenId);
    }
}
