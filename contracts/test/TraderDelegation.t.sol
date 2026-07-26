// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TraderDelegation} from "../src/TraderDelegation.sol";
import {TraderIdentity} from "../src/TraderIdentity.sol";

contract TraderDelegationTest is Test {
    TraderIdentity public identity;
    TraderDelegation public delegation;

    address manager = makeAddr("manager");
    address buyer = makeAddr("buyer");
    address attacker = makeAddr("attacker");
    address agent = makeAddr("agent");
    address otherAgent = makeAddr("otherAgent");
    address settlement = makeAddr("settlement");
    address otherContract = makeAddr("otherContract");

    uint256 public tokenId;
    uint64 expiry;

    // Cached because reading a public constant is itself an external call,
    // which would consume a pending vm.prank before the call under test.
    uint256 ACTION_QUOTE;
    uint256 ACTION_FILL;
    uint256 ACTION_CANCEL;
    uint256 ACTION_CRACK;
    uint256 ACTION_ALL;
    uint64 MAX_DURATION;

    event DelegationGranted(
        uint256 indexed tokenId, address indexed agentKey, uint64 epoch, uint64 expiresAt, uint256 actions
    );
    event DelegationRevoked(uint256 indexed tokenId, address indexed agentKey);
    event DelegationsRevokedAll(uint256 indexed tokenId, uint64 generation);

    function setUp() public {
        identity = new TraderIdentity("Margin Call Trader", "MCTRADER", "https://margincall.test/t/");
        delegation = new TraderDelegation(address(identity));

        vm.prank(manager);
        tokenId = identity.mint(manager);

        expiry = uint64(block.timestamp + 1 hours);

        ACTION_QUOTE = delegation.ACTION_QUOTE();
        ACTION_FILL = delegation.ACTION_FILL();
        ACTION_CANCEL = delegation.ACTION_CANCEL();
        ACTION_CRACK = delegation.ACTION_CRACK();
        ACTION_ALL = delegation.ACTION_ALL();
        MAX_DURATION = delegation.MAX_DELEGATION_DURATION();
    }

    function _targets() internal view returns (address[] memory targets) {
        targets = new address[](1);
        targets[0] = settlement;
    }

    function _grant(address who, uint256 actions) internal {
        vm.prank(who);
        delegation.grant(tokenId, agent, actions, _targets(), expiry);
    }

    function _grantFill() internal {
        _grant(manager, ACTION_FILL);
    }

    function _fillAuthorized() internal view returns (bool) {
        return delegation.isAuthorized(tokenId, agent, ACTION_FILL, settlement);
    }

    // ========== Granting ==========

    function test_grant_authorizesNamedActionOnNamedTarget() public {
        _grantFill();
        assertTrue(_fillAuthorized());
    }

    function test_grant_recordsCurrentEpochAndGeneration() public {
        _grantFill();

        TraderDelegation.Delegation memory d = delegation.delegationOf(tokenId, agent);
        assertEq(d.epoch, identity.authorityEpoch(tokenId));
        assertEq(d.generation, delegation.generationOf(tokenId));
        assertEq(d.expiresAt, expiry);
        assertEq(d.actions, ACTION_FILL);
    }

    function test_grant_emitsGranted() public {
        vm.expectEmit(true, true, false, true);
        emit DelegationGranted(tokenId, agent, 1, expiry, ACTION_FILL);
        _grantFill();
    }

    function test_grant_supportsMultipleActions() public {
        _grant(manager, ACTION_QUOTE | ACTION_CANCEL);

        assertTrue(delegation.isAuthorized(tokenId, agent, ACTION_QUOTE, settlement));
        assertTrue(delegation.isAuthorized(tokenId, agent, ACTION_CANCEL, settlement));
        assertFalse(_fillAuthorized());
        assertFalse(delegation.isAuthorized(tokenId, agent, ACTION_CRACK, settlement));
    }

    function test_grant_overwritesPreviousGrantForSameKey() public {
        _grant(manager, ACTION_FILL);
        _grant(manager, ACTION_QUOTE);

        assertFalse(_fillAuthorized());
        assertTrue(delegation.isAuthorized(tokenId, agent, ACTION_QUOTE, settlement));
    }

    function test_grant_keysAreIndependent() public {
        _grantFill();

        assertTrue(_fillAuthorized());
        assertFalse(delegation.isAuthorized(tokenId, otherAgent, ACTION_FILL, settlement));
    }

    function test_grant_revertsForNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert("Not trader owner");
        delegation.grant(tokenId, agent, ACTION_FILL, _targets(), expiry);
    }

    function test_grant_revertsForZeroAgentKey() public {
        vm.prank(manager);
        vm.expectRevert("Zero agent key");
        delegation.grant(tokenId, address(0), ACTION_FILL, _targets(), expiry);
    }

    function test_grant_revertsForZeroActions() public {
        vm.prank(manager);
        vm.expectRevert("Invalid actions");
        delegation.grant(tokenId, agent, 0, _targets(), expiry);
    }

    function test_grant_revertsForUndefinedActionBits() public {
        vm.prank(manager);
        vm.expectRevert("Invalid actions");
        delegation.grant(tokenId, agent, 1 << 9, _targets(), expiry);
    }

    function test_grant_revertsForEmptyTargets() public {
        address[] memory empty = new address[](0);

        vm.prank(manager);
        vm.expectRevert("No targets");
        delegation.grant(tokenId, agent, ACTION_FILL, empty, expiry);
    }

    function test_grant_revertsForZeroTarget() public {
        address[] memory targets = new address[](1);

        vm.prank(manager);
        vm.expectRevert("Zero target");
        delegation.grant(tokenId, agent, ACTION_FILL, targets, expiry);
    }

    function test_grant_revertsForPastExpiry() public {
        vm.prank(manager);
        vm.expectRevert("Expiry in past");
        delegation.grant(tokenId, agent, ACTION_FILL, _targets(), uint64(block.timestamp));
    }

    function test_grant_revertsBeyondMaximumDuration() public {
        uint64 tooFar = uint64(block.timestamp + MAX_DURATION + 1);

        vm.prank(manager);
        vm.expectRevert("Expiry too far");
        delegation.grant(tokenId, agent, ACTION_FILL, _targets(), tooFar);
    }

    function test_grant_revertsWhileTraderUnclaimed() public {
        vm.prank(manager);
        identity.transferFrom(manager, buyer, tokenId);

        vm.prank(buyer);
        vm.expectRevert("Trader unclaimed");
        delegation.grant(tokenId, agent, ACTION_FILL, _targets(), expiry);
    }

    // ========== Scope boundaries ==========

    function test_isAuthorized_rejectsUnlistedTarget() public {
        _grantFill();
        assertFalse(delegation.isAuthorized(tokenId, agent, ACTION_FILL, otherContract));
    }

    function test_isAuthorized_rejectsUngrantedAction() public {
        _grantFill();
        assertFalse(delegation.isAuthorized(tokenId, agent, ACTION_CRACK, settlement));
    }

    function test_isAuthorized_rejectsZeroAction() public {
        _grantFill();
        assertFalse(delegation.isAuthorized(tokenId, agent, 0, settlement));
    }

    function test_isAuthorized_requiresEveryRequestedActionBit() public {
        _grant(manager, ACTION_FILL);

        uint256 both = ACTION_FILL | ACTION_CRACK;
        assertFalse(delegation.isAuthorized(tokenId, agent, both, settlement));
    }

    function test_isAuthorized_falseForNeverGrantedKey() public view {
        assertFalse(delegation.isAuthorized(tokenId, otherAgent, ACTION_FILL, settlement));
    }

    function test_isAuthorized_falseAfterExpiry() public {
        _grantFill();
        assertTrue(_fillAuthorized());

        vm.warp(expiry);
        assertFalse(_fillAuthorized());
    }

    function test_isAuthorized_trueUpToTheSecondBeforeExpiry() public {
        _grantFill();
        vm.warp(expiry - 1);
        assertTrue(_fillAuthorized());
    }

    function test_assertAuthorized_revertsWhenUnauthorized() public {
        _grantFill();

        vm.expectRevert("Agent not authorized");
        delegation.assertAuthorized(tokenId, agent, ACTION_FILL, otherContract);
    }

    function test_assertAuthorized_passesWhenAuthorized() public {
        _grantFill();
        delegation.assertAuthorized(tokenId, agent, ACTION_FILL, settlement);
    }

    // ========== Transfer invalidation ==========

    function test_transfer_killsEveryDelegatedKey() public {
        _grantFill();
        vm.prank(manager);
        delegation.grant(tokenId, otherAgent, ACTION_CRACK, _targets(), expiry);

        vm.prank(manager);
        identity.transferFrom(manager, buyer, tokenId);

        assertFalse(_fillAuthorized());
        assertFalse(delegation.isAuthorized(tokenId, otherAgent, ACTION_CRACK, settlement));
    }

    function test_transfer_killsKeysWithoutAnyRevokeTransaction() public {
        _grantFill();

        // The departing owner never cooperates; the epoch change is enough.
        vm.prank(manager);
        identity.transferFrom(manager, buyer, tokenId);

        vm.prank(buyer);
        identity.claim(tokenId);

        assertFalse(_fillAuthorized());
    }

    function test_transfer_previousOwnerCannotRegrant() public {
        vm.prank(manager);
        identity.transferFrom(manager, buyer, tokenId);

        vm.prank(manager);
        vm.expectRevert("Not trader owner");
        delegation.grant(tokenId, agent, ACTION_FILL, _targets(), expiry);
    }

    function test_transfer_backToOriginalOwnerDoesNotRevivePriorKeys() public {
        _grantFill();

        vm.prank(manager);
        identity.transferFrom(manager, buyer, tokenId);
        vm.prank(buyer);
        identity.claim(tokenId);
        vm.prank(buyer);
        identity.transferFrom(buyer, manager, tokenId);
        vm.prank(manager);
        identity.claim(tokenId);

        // Epoch advanced twice; the original grant stays dead.
        assertFalse(_fillAuthorized());
    }

    function test_newOwner_canGrantAfterClaiming() public {
        _grantFill();

        vm.prank(manager);
        identity.transferFrom(manager, buyer, tokenId);
        vm.prank(buyer);
        identity.claim(tokenId);

        vm.prank(buyer);
        delegation.grant(tokenId, agent, ACTION_FILL, _targets(), expiry);

        assertTrue(_fillAuthorized());
    }

    // ========== Claim gating ==========

    function test_unclaimedTrader_hasNoAuthorizedKeys() public {
        _grantFill();

        vm.prank(manager);
        identity.transferFrom(manager, buyer, tokenId);
        vm.prank(buyer);
        identity.claim(tokenId);
        vm.prank(buyer);
        delegation.grant(tokenId, agent, ACTION_FILL, _targets(), expiry);
        assertTrue(_fillAuthorized());

        // A further transfer both advances the epoch and unclaims the Trader.
        vm.prank(buyer);
        identity.transferFrom(buyer, attacker, tokenId);
        assertFalse(identity.isClaimed(tokenId));
        assertFalse(_fillAuthorized());
    }

    // ========== Revocation ==========

    function test_revoke_disablesSingleKey() public {
        _grantFill();
        vm.prank(manager);
        delegation.grant(tokenId, otherAgent, ACTION_FILL, _targets(), expiry);

        vm.prank(manager);
        delegation.revoke(tokenId, agent);

        assertFalse(_fillAuthorized());
        assertTrue(delegation.isAuthorized(tokenId, otherAgent, ACTION_FILL, settlement));
    }

    function test_revoke_emitsRevoked() public {
        _grantFill();

        vm.expectEmit(true, true, false, false);
        emit DelegationRevoked(tokenId, agent);
        vm.prank(manager);
        delegation.revoke(tokenId, agent);
    }

    function test_revoke_revertsForNonOwner() public {
        _grantFill();

        vm.prank(attacker);
        vm.expectRevert("Not trader owner");
        delegation.revoke(tokenId, agent);
    }

    function test_revoke_revertsWhenNothingGranted() public {
        vm.prank(manager);
        vm.expectRevert("No delegation");
        delegation.revoke(tokenId, agent);
    }

    function test_revoke_thenRegrantWorks() public {
        _grantFill();
        vm.prank(manager);
        delegation.revoke(tokenId, agent);
        _grantFill();

        assertTrue(_fillAuthorized());
    }

    function test_revokeAll_disablesEveryKeyAtOnce() public {
        _grantFill();
        vm.prank(manager);
        delegation.grant(tokenId, otherAgent, ACTION_CRACK, _targets(), expiry);

        vm.prank(manager);
        delegation.revokeAll(tokenId);

        assertFalse(_fillAuthorized());
        assertFalse(delegation.isAuthorized(tokenId, otherAgent, ACTION_CRACK, settlement));
    }

    function test_revokeAll_emitsWithNewGeneration() public {
        vm.expectEmit(true, false, false, true);
        emit DelegationsRevokedAll(tokenId, 1);
        vm.prank(manager);
        delegation.revokeAll(tokenId);
    }

    function test_revokeAll_allowsFreshGrantsAfterwards() public {
        _grantFill();
        vm.prank(manager);
        delegation.revokeAll(tokenId);
        _grantFill();

        assertTrue(_fillAuthorized());
    }

    function test_revokeAll_revertsForNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert("Not trader owner");
        delegation.revokeAll(tokenId);
    }

    function test_revokeAll_isScopedToOneTrader() public {
        vm.prank(manager);
        uint256 second = identity.mint(manager);

        _grantFill();
        vm.prank(manager);
        delegation.grant(second, agent, ACTION_FILL, _targets(), expiry);

        vm.prank(manager);
        delegation.revokeAll(tokenId);

        assertFalse(_fillAuthorized());
        assertTrue(delegation.isAuthorized(second, agent, ACTION_FILL, settlement));
    }

    // ========== Construction ==========

    function test_constructor_revertsForZeroIdentity() public {
        vm.expectRevert("Zero identity");
        new TraderDelegation(address(0));
    }

    // ========== Fuzz ==========

    function testFuzz_onlyTraderOwnerCanGrant(address caller) public {
        vm.assume(caller != manager);

        vm.prank(caller);
        vm.expectRevert("Not trader owner");
        delegation.grant(tokenId, agent, ACTION_FILL, _targets(), expiry);
    }

    function testFuzz_noKeySurvivesATransfer(address agentKey, uint8 actionSeed) public {
        vm.assume(agentKey != address(0));
        uint256 actions = uint256(bound(actionSeed, 1, ACTION_ALL));

        vm.prank(manager);
        delegation.grant(tokenId, agentKey, actions, _targets(), expiry);

        vm.prank(manager);
        identity.transferFrom(manager, buyer, tokenId);

        for (uint256 bit = 0; bit < 4; bit++) {
            assertFalse(delegation.isAuthorized(tokenId, agentKey, 1 << bit, settlement));
        }
    }

    function testFuzz_authorizationNeverLeaksToOtherTargets(address target) public {
        vm.assume(target != settlement);
        _grantFill();

        assertFalse(delegation.isAuthorized(tokenId, agent, ACTION_FILL, target));
    }
}
