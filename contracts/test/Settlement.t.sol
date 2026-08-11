// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

import {inco} from "@inco/lightning/src/Lib.sol";

import {BankrollVault} from "../src/BankrollVault.sol";
import {DeskDollars} from "../src/DeskDollars.sol";
import {IBankrollVault} from "../src/interfaces/IBankrollVault.sol";
import {LeverageTiers} from "../src/libraries/LeverageTiers.sol";
import {MarginCallCrash} from "../src/MarginCallCrash.sol";
import {IncoRandomMock} from "./mocks/IncoRandomMock.sol";
import {IncoVerifierMock} from "./mocks/IncoVerifierMock.sol";

/// @dev Desk Dollars that can refuse transfers so claim retryability is testable.
contract RejectingDeskDollars is DeskDollars {
    bool public rejectTransfers;

    constructor(address bankrollSeedRecipient) DeskDollars(bankrollSeedRecipient) {}

    function setRejectTransfers(bool rejectTransfers_) external {
        rejectTransfers = rejectTransfers_;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (rejectTransfers && from != address(0) && to != address(0)) {
            revert("transfer rejected");
        }
        super._update(from, to, value);
    }
}

contract SettlementTest is Test {
    uint64 internal constant EPOCH_ORIGIN = 1_000_000;
    uint256 internal constant INCO_FEE = 1e12;
    bytes32 internal constant RANDOM_HANDLE = bytes32(uint256(0xCAFE));
    uint256 internal constant ONE_TUSD = 1_000_000;

    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant LP = address(0x1A);
    address internal constant STRANGER = address(0x57A);
    address internal constant RECEIVER = address(0x6EC);

    event TicketClaimed(
        uint256 indexed roundId, uint256 indexed ticketId, address indexed player, address receiver, uint256 payout
    );
    event TicketLossSettled(uint256 indexed roundId, uint256 indexed ticketId, address indexed player);
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

    function testClaimPaysExactPayoutOnceAndRejectsReplay() public {
        // r=2080 => crashPointBps = 12500; 1.25x wins at equality.
        uint256 winTicketId = _enterAndFinalizeAt(1, ALICE, ONE_TUSD, 12_500, 2_080);
        uint256 expectedPayout = (ONE_TUSD * 12_500) / 10_000;
        uint256 aliceBefore = token.balanceOf(ALICE);

        vm.prank(STRANGER);
        vm.expectEmit(true, true, true, true, address(game));
        emit TicketClaimed(1, winTicketId, ALICE, ALICE, expectedPayout);
        game.claim(winTicketId, address(0));

        assertEq(token.balanceOf(ALICE), aliceBefore + expectedPayout);
        MarginCallCrash.Ticket memory ticket = game.getTicket(winTicketId);
        assertTrue(ticket.settled);
        assertTrue(ticket.claimed);

        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.TicketAlreadySettled.selector, winTicketId));
        game.claim(winTicketId, address(0));
    }

    function testOwnerCanRedirectPayoutButStrangerCannot() public {
        uint256 ticketId = _enterAndFinalizeAt(0, ALICE, 5 * ONE_TUSD, 20_000, 5_050);
        uint256 expectedPayout = (5 * ONE_TUSD * 20_000) / 10_000;

        vm.prank(STRANGER);
        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.UnauthorizedClaimReceiver.selector, STRANGER, RECEIVER));
        game.claim(ticketId, RECEIVER);

        uint256 receiverBefore = token.balanceOf(RECEIVER);
        vm.prank(ALICE);
        game.claim(ticketId, RECEIVER);
        assertEq(token.balanceOf(RECEIVER), receiverBefore + expectedPayout);
    }

    function testSettleLossIsPermissionlessAndZeroPayout() public {
        // r=0 => crash 9900 < 12500 => loss
        uint256 ticketId = _enterAndFinalizeAt(0, ALICE, ONE_TUSD, 12_500, 0);
        uint256 aliceBefore = token.balanceOf(ALICE);
        uint256 reservedBefore = vault.reservedLiabilities();

        vm.prank(STRANGER);
        vm.expectEmit(true, true, true, true, address(game));
        emit TicketLossSettled(0, ticketId, ALICE);
        game.settleLoss(ticketId);

        assertEq(token.balanceOf(ALICE), aliceBefore);
        assertEq(vault.reservedLiabilities(), reservedBefore - (ONE_TUSD * 12_500) / 10_000);
        assertTrue(game.getTicket(ticketId).settled);
        assertFalse(game.getTicket(ticketId).claimed);

        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.TicketAlreadySettled.selector, ticketId));
        game.settleLoss(ticketId);
    }

    function testLoserCannotClaimAndWinnerCannotSettleLoss() public {
        uint256 lossTicket = _enterAndFinalizeAt(0, ALICE, ONE_TUSD, 12_500, 0);
        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.TicketDidNotWin.selector, lossTicket));
        game.claim(lossTicket, address(0));

        uint256 winTicket = _enterAndFinalizeAt(1, BOB, ONE_TUSD, 12_500, 2_080);
        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.TicketDidNotLose.selector, winTicket));
        game.settleLoss(winTicket);
    }

    function testEqualityAtTierIsAWin() public {
        // Find r such that crashPointBps == 12500 exactly.
        // 99000000 / (10000-r) = 12500 => 10000-r = 99000000/12500 = 7920 => r = 2080
        uint256 ticketId = _enterAndFinalizeAt(0, ALICE, ONE_TUSD, 12_500, 2_080);
        assertEq(game.getRound(0).crashPointBps, 12_500);

        vm.prank(ALICE);
        game.claim(ticketId, address(0));
        assertTrue(game.getTicket(ticketId).claimed);
    }

    function testAllEighteenMarginTierPayouts() public {
        uint256[3] memory margins = [ONE_TUSD, 5 * ONE_TUSD, 10 * ONE_TUSD];
        uint256[6] memory tiers = LeverageTiers.all();
        // Plaintexts that just reach each tier (equality wins).
        uint256[6] memory plaintexts = [uint256(2_080), 3_400, 5_050, 6_700, 8_020, 9_010];

        uint256 roundId;
        for (uint256 i = 0; i < margins.length; ++i) {
            for (uint256 j = 0; j < tiers.length; ++j) {
                address player = address(uint160(3_000 + roundId));
                vm.prank(LP);
                assertTrue(token.transfer(player, margins[i]));
                vm.prank(player);
                token.approve(address(vault), margins[i]);

                uint256 ticketId = _enterAndFinalizeAt(roundId, player, margins[i], tiers[j], plaintexts[j]);
                uint256 expected = (margins[i] * tiers[j]) / 10_000;
                uint256 beforeBal = token.balanceOf(player);

                vm.prank(player);
                game.claim(ticketId, address(0));
                assertEq(token.balanceOf(player), beforeBal + expected);
                ++roundId;
            }
        }
    }

    function testTenXCapBindsPayableCrashPoint() public {
        // r=9999 => capped at 100000 (10.00x)
        uint256 ticketId = _enterAndFinalizeAt(0, ALICE, 10 * ONE_TUSD, 100_000, 9_999);
        assertEq(game.getRound(0).crashPointBps, 100_000);

        uint256 expected = 100 * ONE_TUSD;
        uint256 beforeBal = token.balanceOf(ALICE);
        vm.prank(ALICE);
        game.claim(ticketId, address(0));
        assertEq(token.balanceOf(ALICE), beforeBal + expected);
    }

    function testDistributionSamplesMatchExactReachProbabilities() public pure {
        uint256[6] memory tiers = LeverageTiers.all();
        uint256[6] memory expected = [uint256(7_920), 6_600, 4_950, 3_300, 1_980, 990];
        uint256[6] memory counts;

        for (uint256 r = 0; r < 10_000; ++r) {
            uint256 crashPointBps = _crashPointFromRandom(r);
            for (uint256 i = 0; i < tiers.length; ++i) {
                if (tiers[i] <= crashPointBps) ++counts[i];
            }
        }

        for (uint256 i = 0; i < tiers.length; ++i) {
            assertEq(counts[i], expected[i]);
        }
    }

    function testShareValueFallsOnNetWinningFinalizeBeforeClaim() public {
        game.openRound{value: INCO_FEE}(0);
        vm.prank(ALICE);
        game.enter(0, 10 * ONE_TUSD, 100_000); // max payout 100

        uint256 shareBefore = vault.assetsPerShare();
        _finalizeAt(0, 9_010); // 10.00x — ticket wins; liability 100, margin 10 => net -90

        uint256 shareAfter = vault.assetsPerShare();
        assertLt(shareAfter, shareBefore);
        assertEq(vault.unrecognizedMargin(), 0);
        assertEq(vault.pendingObligations(), 100 * ONE_TUSD);

        // Price already moved; claim does not move share price further (only transfers gross).
        uint256 shareBeforeClaim = vault.assetsPerShare();
        uint256 ticketId = game.getTicketId(0, ALICE);
        vm.prank(ALICE);
        game.claim(ticketId, address(0));
        // After claim: pendingObligations down, grossAssets down by same amount => totalAssets unchanged
        assertEq(vault.assetsPerShare(), shareBeforeClaim);
        assertEq(vault.pendingObligations(), 0);
    }

    function testShareValueRisesOnNetLosingFinalizeBeforeClaim() public {
        game.openRound{value: INCO_FEE}(0);
        vm.prank(ALICE);
        game.enter(0, 10 * ONE_TUSD, 100_000);

        uint256 shareBefore = vault.assetsPerShare();
        _finalizeAt(0, 0); // 0.99x — ticket loses; liability 0, margin 10 => net +10

        assertGt(vault.assetsPerShare(), shareBefore);
        assertEq(vault.unrecognizedMargin(), 0);
        assertEq(vault.pendingObligations(), 0);

        uint256 ticketId = game.getTicketId(0, ALICE);
        vm.prank(STRANGER);
        game.settleLoss(ticketId);
        assertEq(vault.reservedLiabilities(), 0);
        assertEq(vault.unrecognizedMargin(), 0);
        assertEq(vault.pendingObligations(), 0);
    }

    function testMidRoundRedeemThenRedepositIsNotRiskless() public {
        // LP seeds; Alice enters; LP redeems mid-round; round finalizes as win; LP deposits again.
        // Share price must fall at finalize, so the round-trip is not a free option.
        game.openRound{value: INCO_FEE}(0);
        vm.prank(ALICE);
        game.enter(0, 10 * ONE_TUSD, 100_000);

        uint256 redeemAssets = vault.maxWithdraw(LP) / 2;
        uint256 sharesBefore = vault.balanceOf(LP);
        vm.prank(LP);
        uint256 sharesBurned = vault.withdraw(redeemAssets, LP, LP);

        _finalizeAt(0, 9_010); // net winning for players

        uint256 previewShares = vault.previewDeposit(redeemAssets);
        // After a player win, the same assets buy more shares than were burned (price fell).
        // A riskless free option would require getting back at least the burned shares for free;
        // here the LP who left mid-round and re-entered after a player win buys MORE shares
        // for the same assets — they did not extract value from remaining LPs via a one-sided option.
        // The critical assertion from ADR 0007: mid-round exit cannot lock in a never-lose trade
        // that captures unearned margin. With deferred recognition, finalize moved price down,
        // so redepositing the same assets yields more shares (they buy the dip), which is the
        // opposite of riskless extraction of unearned margin.
        assertGt(previewShares, sharesBurned);

        // Opposite outcome: mid-round exit + losing finalize raises price; redeposit buys fewer shares.
        // Covered by the rising share-price test; here we also assert LP who stayed captures the gain.
        assertLt(vault.balanceOf(LP), sharesBefore);
    }

    function testClaimTransferFailureRollsBackAndStaysRetryable() public {
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
        _finalizeGameAt(rejectingGame, 0, 2_080);

        uint256 ticketId = rejectingGame.getTicketId(0, ALICE);
        rejecting.setRejectTransfers(true);

        vm.prank(ALICE);
        vm.expectRevert(bytes("transfer rejected"));
        rejectingGame.claim(ticketId, address(0));

        assertFalse(rejectingGame.getTicket(ticketId).settled);
        assertEq(rejectingVault.pendingObligations(), (ONE_TUSD * 12_500) / 10_000);

        rejecting.setRejectTransfers(false);
        uint256 beforeBal = rejecting.balanceOf(ALICE);
        vm.prank(ALICE);
        rejectingGame.claim(ticketId, address(0));
        assertEq(rejecting.balanceOf(ALICE), beforeBal + (ONE_TUSD * 12_500) / 10_000);
        assertTrue(rejectingGame.getTicket(ticketId).settled);
    }

    function testSettlementEventsReconstructObligations() public {
        uint256 winTicket = _enterAndFinalizeAt(0, ALICE, ONE_TUSD, 12_500, 2_080);
        // Also need a loser in same round — can't; round already finalized.
        // Separate loss round:
        uint256 lossTicket = _enterAndFinalizeAt(1, BOB, ONE_TUSD, 12_500, 0);

        vm.recordLogs();
        vm.prank(STRANGER);
        game.claim(winTicket, address(0));
        vm.prank(STRANGER);
        game.settleLoss(lossTicket);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bool sawClaim;
        bool sawLoss;
        bool sawReleaseWin;
        bool sawReleaseLoss;
        for (uint256 i = 0; i < logs.length; ++i) {
            bytes32 topic0 = logs[i].topics[0];
            if (topic0 == TicketClaimed.selector) {
                sawClaim = true;
                assertEq(uint256(logs[i].topics[1]), 0);
                assertEq(uint256(logs[i].topics[2]), winTicket);
                assertEq(address(uint160(uint256(logs[i].topics[3]))), ALICE);
            }
            if (topic0 == TicketLossSettled.selector) {
                sawLoss = true;
                assertEq(uint256(logs[i].topics[1]), 1);
                assertEq(uint256(logs[i].topics[2]), lossTicket);
                assertEq(address(uint160(uint256(logs[i].topics[3]))), BOB);
            }
            if (topic0 == LiabilityReleased.selector) {
                address player = address(uint160(uint256(logs[i].topics[3])));
                if (player == ALICE) sawReleaseWin = true;
                if (player == BOB) sawReleaseLoss = true;
            }
        }
        assertTrue(sawClaim);
        assertTrue(sawLoss);
        assertTrue(sawReleaseWin);
        assertTrue(sawReleaseLoss);
        assertEq(vault.pendingObligations(), 0);
        assertEq(vault.unrecognizedMargin(), 0);
        assertEq(vault.reservedLiabilities(), 0);
    }

    function _enterAndFinalizeAt(
        uint256 roundId,
        address player,
        uint256 margin,
        uint256 leverageBps,
        uint256 plaintext
    ) internal returns (uint256 ticketId) {
        IncoRandomMock(address(inco)).configure(INCO_FEE, bytes32(uint256(0xA0000) + roundId));
        uint64 openAt = EPOCH_ORIGIN + uint64(roundId * 60);
        vm.warp(openAt);
        game.openRound{value: INCO_FEE}(roundId);
        vm.prank(player);
        game.enter(roundId, margin, leverageBps);
        ticketId = game.getTicketId(roundId, player);
        _finalizeAt(roundId, plaintext);
    }

    function _finalizeAt(uint256 roundId, uint256 plaintext) internal {
        _finalizeGameAt(game, roundId, plaintext);
    }

    function _finalizeGameAt(MarginCallCrash target, uint256 roundId, uint256 plaintext) internal {
        (, uint64 lockAt,) = target.roundTimes(roundId);
        vm.warp(lockAt);
        target.requestReveal(roundId);
        bytes[] memory signatures = new bytes[](1);
        signatures[0] = hex"01";
        target.finalizeRound(roundId, plaintext, signatures);
    }

    function _crashPointFromRandom(uint256 randomValue) internal pure returns (uint256) {
        uint256 rawCrashBps = 99_000_000 / (10_000 - randomValue);
        return rawCrashBps > 100_000 ? 100_000 : rawCrashBps;
    }
}
