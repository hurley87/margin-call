// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";

import {inco} from "@inco/lightning/src/Lib.sol";

import {BankrollVault} from "../src/BankrollVault.sol";
import {DeskDollars} from "../src/DeskDollars.sol";
import {IBankrollVault} from "../src/interfaces/IBankrollVault.sol";
import {MarginCallCrash} from "../src/MarginCallCrash.sol";
import {IncoRandomMock} from "./mocks/IncoRandomMock.sol";
import {IncoVerifierMock} from "./mocks/IncoVerifierMock.sol";
import {RejectingDeskDollars} from "./Settlement.t.sol";

contract ExpiryRefundTest is Test {
    uint64 internal constant EPOCH_ORIGIN = 1_000_000;
    uint256 internal constant INCO_FEE = 1e12;
    bytes32 internal constant RANDOM_HANDLE = bytes32(uint256(0xCAFE));
    uint256 internal constant ONE_TUSD = 1_000_000;

    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant LP = address(0x1A);
    address internal constant STRANGER = address(0x57A);
    address internal constant RECEIVER = address(0x6EC);

    event TicketRefunded(
        uint256 indexed roundId, uint256 indexed ticketId, address indexed player, address receiver, uint256 margin
    );
    event LiabilityReleased(
        uint256 indexed roundId,
        uint256 indexed ticketId,
        address indexed player,
        uint256 releasedReservation,
        uint256 paidAmount
    );

    DeskDollars internal token;
    BankrollVault internal vault;
    MarginCallCrash internal game;
    IncoRandomMock internal incoMock;

    function setUp() public {
        IncoRandomMock mock = new IncoRandomMock();
        vm.etch(address(inco), address(mock).code);
        incoMock = IncoRandomMock(address(inco));
        incoMock.configure(INCO_FEE, RANDOM_HANDLE);

        IncoVerifierMock verifier = new IncoVerifierMock();
        incoMock.setVerifier(address(verifier));

        token = new DeskDollars(LP);
        vault = new BankrollVault(token);
        game = new MarginCallCrash(EPOCH_ORIGIN, IBankrollVault(address(vault)));
        vault.setAuthorizedGame(address(game));

        vm.startPrank(LP);
        assertTrue(token.transfer(ALICE, 1_000 * ONE_TUSD));
        assertTrue(token.transfer(BOB, 1_000 * ONE_TUSD));
        token.approve(address(vault), type(uint256).max);
        vault.deposit(12_000 * ONE_TUSD, LP);
        vm.stopPrank();

        vm.prank(ALICE);
        token.approve(address(vault), type(uint256).max);
        vm.prank(BOB);
        token.approve(address(vault), type(uint256).max);

        vm.deal(ALICE, 10 ether);
        vm.deal(BOB, 10 ether);
        vm.warp(EPOCH_ORIGIN);
    }

    function testExpiryFromOpenIsPricingNeutral() public {
        uint256 ticketId = _enter(0, ALICE, ONE_TUSD, 12_500);
        uint256 priceBefore = vault.assetsPerShare();
        assertEq(vault.unrecognizedMargin(), ONE_TUSD);
        assertEq(vault.pendingObligations(), 0);

        (,, uint64 expiresAt) = game.roundTimes(0);
        vm.warp(expiresAt);
        game.expireRound(0);

        assertEq(uint8(game.getRound(0).status), uint8(MarginCallCrash.RoundStatus.Expired));
        assertEq(vault.unrecognizedMargin(), 0);
        assertEq(vault.pendingObligations(), ONE_TUSD);
        assertEq(vault.assetsPerShare(), priceBefore);
        assertEq(game.getTicket(ticketId).margin, ONE_TUSD);
    }

    function testExpiryFromRevealRequestedIsPricingNeutral() public {
        uint256 ticketId = _enter(0, ALICE, ONE_TUSD, 12_500);
        uint256 priceBefore = vault.assetsPerShare();
        assertEq(vault.unrecognizedMargin(), ONE_TUSD);
        assertEq(vault.pendingObligations(), 0);

        (, uint64 lockAt, uint64 expiresAt) = game.roundTimes(0);
        vm.warp(lockAt);
        game.requestReveal(0);
        vm.warp(expiresAt);
        game.expireRound(0);

        assertEq(uint8(game.getRound(0).status), uint8(MarginCallCrash.RoundStatus.Expired));
        assertEq(vault.unrecognizedMargin(), 0);
        assertEq(vault.pendingObligations(), ONE_TUSD);
        assertEq(vault.assetsPerShare(), priceBefore);
        assertEq(game.getTicket(ticketId).margin, ONE_TUSD);
    }

    function testTicketlessExpireHasNoVaultEffect() public {
        IncoRandomMock(address(inco)).configure(INCO_FEE, bytes32(uint256(0xBEEF)));
        game.openRound{value: INCO_FEE}(0);

        uint256 priceBefore = vault.assetsPerShare();
        uint256 unrecognizedBefore = vault.unrecognizedMargin();
        uint256 pendingBefore = vault.pendingObligations();
        uint256 reservedBefore = vault.reservedLiabilities();

        (,, uint64 expiresAt) = game.roundTimes(0);
        vm.warp(expiresAt);
        game.expireRound(0);

        assertEq(uint8(game.getRound(0).status), uint8(MarginCallCrash.RoundStatus.Expired));
        assertEq(vault.unrecognizedMargin(), unrecognizedBefore);
        assertEq(vault.pendingObligations(), pendingBefore);
        assertEq(vault.reservedLiabilities(), reservedBefore);
        assertEq(vault.assetsPerShare(), priceBefore);
    }

    function testOwnerRefundsExactMarginOnceAndRejectsReplay() public {
        uint256 ticketId = _enterAndExpireFromOpen(0, ALICE, 5 * ONE_TUSD, 20_000);
        uint256 aliceBefore = token.balanceOf(ALICE);

        vm.prank(ALICE);
        vm.expectEmit(true, true, true, true, address(game));
        emit TicketRefunded(0, ticketId, ALICE, ALICE, 5 * ONE_TUSD);
        game.refund(ticketId, address(0));

        assertEq(token.balanceOf(ALICE), aliceBefore + 5 * ONE_TUSD);
        MarginCallCrash.Ticket memory ticket = game.getTicket(ticketId);
        assertTrue(ticket.settled);
        assertFalse(ticket.claimed);
        assertEq(vault.pendingObligations(), 0);
        assertEq(vault.getReservation(ticketId).player, address(0));

        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.TicketAlreadySettled.selector, ticketId));
        game.refund(ticketId, address(0));
    }

    function testOwnerCanRedirectRefundButStrangerCannot() public {
        uint256 ticketId = _enterAndExpireFromOpen(0, ALICE, ONE_TUSD, 12_500);

        vm.prank(STRANGER);
        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.UnauthorizedClaimReceiver.selector, STRANGER, RECEIVER));
        game.refund(ticketId, RECEIVER);

        uint256 receiverBefore = token.balanceOf(RECEIVER);
        vm.prank(ALICE);
        game.refund(ticketId, RECEIVER);
        assertEq(token.balanceOf(RECEIVER), receiverBefore + ONE_TUSD);
    }

    function testStrangerCanRefundToOwner() public {
        uint256 ticketId = _enterAndExpireFromOpen(0, ALICE, ONE_TUSD, 12_500);
        uint256 aliceBefore = token.balanceOf(ALICE);

        vm.prank(STRANGER);
        game.refund(ticketId, address(0));
        assertEq(token.balanceOf(ALICE), aliceBefore + ONE_TUSD);
    }

    function testRefundTransferFailureRollsBackAndStaysRetryable() public {
        RejectingDeskDollars rejecting = new RejectingDeskDollars(LP);
        BankrollVault rejectingVault = new BankrollVault(rejecting);
        MarginCallCrash rejectingGame = new MarginCallCrash(EPOCH_ORIGIN, IBankrollVault(address(rejectingVault)));
        rejectingVault.setAuthorizedGame(address(rejectingGame));

        vm.startPrank(LP);
        assertTrue(rejecting.transfer(ALICE, 100 * ONE_TUSD));
        rejecting.approve(address(rejectingVault), type(uint256).max);
        rejectingVault.deposit(12_000 * ONE_TUSD, LP);
        vm.stopPrank();

        vm.prank(ALICE);
        rejecting.approve(address(rejectingVault), type(uint256).max);
        vm.deal(ALICE, 10 ether);

        IncoRandomMock(address(inco)).configure(INCO_FEE, bytes32(uint256(0xD00D)));
        rejectingGame.openRound{value: INCO_FEE}(0);
        vm.prank(ALICE);
        rejectingGame.enter(0, ONE_TUSD, 12_500);

        (,, uint64 expiresAt) = rejectingGame.roundTimes(0);
        vm.warp(expiresAt);
        rejectingGame.expireRound(0);

        uint256 ticketId = rejectingGame.getTicketId(0, ALICE);
        rejecting.setRejectTransfers(true);

        vm.prank(ALICE);
        vm.expectRevert(bytes("transfer rejected"));
        rejectingGame.refund(ticketId, address(0));

        assertFalse(rejectingGame.getTicket(ticketId).settled);
        assertEq(rejectingVault.pendingObligations(), ONE_TUSD);
        assertEq(rejectingVault.getReservation(ticketId).player, ALICE);

        rejecting.setRejectTransfers(false);
        uint256 beforeBal = rejecting.balanceOf(ALICE);
        vm.prank(ALICE);
        rejectingGame.refund(ticketId, address(0));
        assertEq(rejecting.balanceOf(ALICE), beforeBal + ONE_TUSD);
        assertTrue(rejectingGame.getTicket(ticketId).settled);
        assertEq(rejectingVault.pendingObligations(), 0);
    }

    function testRefundEventsReconstructObligations() public {
        uint256 aliceTicket = _enterAndExpireFromOpen(0, ALICE, ONE_TUSD, 12_500);
        uint256 bobTicket = _enterAndExpireFromOpen(1, BOB, 5 * ONE_TUSD, 20_000);

        assertEq(vault.pendingObligations(), 6 * ONE_TUSD);

        vm.prank(ALICE);
        vm.expectEmit(true, true, true, true, address(vault));
        emit LiabilityReleased(0, aliceTicket, ALICE, 1_250_000, ONE_TUSD);
        vm.expectEmit(true, true, true, true, address(game));
        emit TicketRefunded(0, aliceTicket, ALICE, ALICE, ONE_TUSD);
        game.refund(aliceTicket, address(0));

        vm.prank(BOB);
        vm.expectEmit(true, true, true, true, address(vault));
        emit LiabilityReleased(1, bobTicket, BOB, 10 * ONE_TUSD, 5 * ONE_TUSD);
        vm.expectEmit(true, true, true, true, address(game));
        emit TicketRefunded(1, bobTicket, BOB, BOB, 5 * ONE_TUSD);
        game.refund(bobTicket, address(0));

        assertEq(vault.pendingObligations(), 0);
        assertEq(vault.unrecognizedMargin(), 0);
        assertEq(vault.reservedLiabilities(), 0);
    }

    function testRefundRequiresExpiredRound() public {
        uint256 ticketId = _enter(0, ALICE, ONE_TUSD, 12_500);

        vm.expectRevert(
            abi.encodeWithSelector(MarginCallCrash.InvalidRoundStatus.selector, 0, MarginCallCrash.RoundStatus.Open)
        );
        game.refund(ticketId, address(0));

        // Finalized rounds also reject refund — settlement uses claim/settleLoss.
        (, uint64 lockAt,) = game.roundTimes(0);
        vm.warp(lockAt);
        game.requestReveal(0);
        bytes[] memory signatures = new bytes[](1);
        signatures[0] = hex"01";
        game.finalizeRound(0, 2_080, signatures);

        vm.expectRevert(
            abi.encodeWithSelector(
                MarginCallCrash.InvalidRoundStatus.selector, 0, MarginCallCrash.RoundStatus.Finalized
            )
        );
        game.refund(ticketId, address(0));
    }

    function testClaimRejectedOnExpiredRound() public {
        uint256 ticketId = _enterAndExpireFromOpen(0, ALICE, ONE_TUSD, 12_500);

        vm.expectRevert(
            abi.encodeWithSelector(MarginCallCrash.InvalidRoundStatus.selector, 0, MarginCallCrash.RoundStatus.Expired)
        );
        game.claim(ticketId, address(0));
    }

    function _enter(uint256 roundId, address player, uint256 margin, uint256 leverageBps)
        internal
        returns (uint256 ticketId)
    {
        IncoRandomMock(address(inco)).configure(INCO_FEE, bytes32(uint256(0xA0000) + roundId));
        uint64 openAt = EPOCH_ORIGIN + uint64(roundId * 60);
        vm.warp(openAt);
        game.openRound{value: INCO_FEE}(roundId);
        vm.prank(player);
        game.enter(roundId, margin, leverageBps);
        ticketId = game.getTicketId(roundId, player);
    }

    function _enterAndExpireFromOpen(uint256 roundId, address player, uint256 margin, uint256 leverageBps)
        internal
        returns (uint256 ticketId)
    {
        ticketId = _enter(roundId, player, margin, leverageBps);
        (,, uint64 expiresAt) = game.roundTimes(roundId);
        vm.warp(expiresAt);
        game.expireRound(roundId);
    }
}
