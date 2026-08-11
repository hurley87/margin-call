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

contract RevealWindowFreezeTest is Test {
    uint64 internal constant EPOCH_ORIGIN = 1_000_000;
    uint256 internal constant INCO_FEE = 1e12;
    bytes32 internal constant RANDOM_HANDLE = bytes32(uint256(0xCAFE));
    uint256 internal constant ONE_TUSD = 1_000_000;

    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant LP = address(0x1A);

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

    function testExposedRevealFreezesShareOpsAndZeroesMaxLimits() public {
        _enter(0, ALICE, ONE_TUSD, 12_500);
        (, uint64 lockAt,) = game.roundTimes(0);
        vm.warp(lockAt);
        game.requestReveal(0);

        assertTrue(vault.shareOperationsFrozen());
        assertEq(vault.frozenRoundCount(), 1);
        assertEq(vault.oldestBlockingRound(), 0);
        assertEq(vault.maxDeposit(LP), 0);
        assertEq(vault.maxMint(LP), 0);
        assertEq(vault.maxWithdraw(LP), 0);
        assertEq(vault.maxRedeem(LP), 0);

        vm.expectRevert(abi.encodeWithSelector(BankrollVault.ShareOperationsFrozen.selector, 0, 1));
        vm.prank(LP);
        vault.deposit(ONE_TUSD, LP);

        vm.expectRevert(abi.encodeWithSelector(BankrollVault.ShareOperationsFrozen.selector, 0, 1));
        vm.prank(LP);
        vault.mint(ONE_TUSD, LP);

        vm.expectRevert(abi.encodeWithSelector(BankrollVault.ShareOperationsFrozen.selector, 0, 1));
        vm.prank(LP);
        vault.withdraw(ONE_TUSD, LP, LP);

        vm.expectRevert(abi.encodeWithSelector(BankrollVault.ShareOperationsFrozen.selector, 0, 1));
        vm.prank(LP);
        vault.redeem(ONE_TUSD, LP, LP);
    }

    function testTicketlessRevealAndExpireNeverFreeze() public {
        IncoRandomMock(address(inco)).configure(INCO_FEE, bytes32(uint256(0xBEEF)));
        game.openRound{value: INCO_FEE}(0);

        (, uint64 lockAt, uint64 expiresAt) = game.roundTimes(0);
        vm.warp(lockAt);
        game.requestReveal(0);

        assertFalse(vault.shareOperationsFrozen());
        assertEq(vault.frozenRoundCount(), 0);
        assertEq(vault.oldestBlockingRound(), vault.NO_BLOCKING_ROUND());
        assertGt(vault.maxWithdraw(LP), 0);

        vm.warp(expiresAt);
        game.expireRound(0);

        assertFalse(vault.shareOperationsFrozen());
        assertEq(vault.frozenRoundCount(), 0);
        assertEq(vault.oldestBlockingRound(), vault.NO_BLOCKING_ROUND());
    }

    function testExposedOpenPastExpiryBlocksUntilExpired() public {
        _enter(0, ALICE, ONE_TUSD, 12_500);
        (,, uint64 expiresAt) = game.roundTimes(0);

        assertFalse(vault.shareOperationsFrozen());
        vm.warp(expiresAt);
        assertTrue(vault.shareOperationsFrozen());
        assertEq(vault.frozenRoundCount(), 0);
        assertEq(vault.oldestBlockingRound(), 0);
        assertEq(vault.maxDeposit(LP), 0);

        vm.expectRevert(abi.encodeWithSelector(BankrollVault.ShareOperationsFrozen.selector, 0, 0));
        vm.prank(LP);
        vault.deposit(ONE_TUSD, LP);

        game.expireRound(0);

        assertFalse(vault.shareOperationsFrozen());
        assertEq(vault.frozenRoundCount(), 0);
        assertEq(vault.oldestBlockingRound(), vault.NO_BLOCKING_ROUND());
        assertEq(vault.pendingObligations(), ONE_TUSD);
        assertGt(vault.maxWithdraw(LP), 0);
    }

    function testFinalizeClearsFreezeAtomicallyWithObligations() public {
        _enter(0, ALICE, ONE_TUSD, 12_500);
        (, uint64 lockAt,) = game.roundTimes(0);
        vm.warp(lockAt);
        game.requestReveal(0);
        assertTrue(vault.shareOperationsFrozen());

        bytes[] memory signatures = new bytes[](1);
        signatures[0] = hex"01";
        // r=2080 => 1.25x; winning liability equals reserved payout.
        game.finalizeRound(0, 2_080, signatures);

        assertFalse(vault.shareOperationsFrozen());
        assertEq(vault.frozenRoundCount(), 0);
        assertEq(vault.oldestBlockingRound(), vault.NO_BLOCKING_ROUND());
        assertEq(vault.pendingObligations(), 1_250_000);
        assertEq(vault.unrecognizedMargin(), 0);
        assertEq(vault.realizedGamePnl(), int256(ONE_TUSD) - int256(1_250_000));
        assertGt(vault.maxDeposit(LP), 0);
    }

    function testExpireFromRevealClearsFreezeAtomically() public {
        _enter(0, ALICE, ONE_TUSD, 12_500);
        (, uint64 lockAt, uint64 expiresAt) = game.roundTimes(0);
        vm.warp(lockAt);
        game.requestReveal(0);
        vm.warp(expiresAt);
        assertEq(vault.frozenRoundCount(), 1);

        game.expireRound(0);

        assertFalse(vault.shareOperationsFrozen());
        assertEq(vault.frozenRoundCount(), 0);
        assertEq(vault.oldestBlockingRound(), vault.NO_BLOCKING_ROUND());
        assertEq(vault.pendingObligations(), ONE_TUSD);
        assertEq(vault.realizedGamePnl(), 0);
    }

    function testOverlappingRevealsStayFrozenUntilLastBlockerResolves() public {
        _enter(0, ALICE, ONE_TUSD, 12_500);
        _enter(1, BOB, ONE_TUSD, 15_000);

        (, uint64 lock0,) = game.roundTimes(0);
        vm.warp(lock0);
        game.requestReveal(0);
        (, uint64 lock1,) = game.roundTimes(1);
        vm.warp(lock1);
        game.requestReveal(1);

        assertEq(vault.frozenRoundCount(), 2);
        assertEq(vault.oldestBlockingRound(), 0);
        assertTrue(vault.shareOperationsFrozen());

        bytes[] memory signatures = new bytes[](1);
        signatures[0] = hex"01";
        game.finalizeRound(0, 2_080, signatures);

        assertEq(vault.frozenRoundCount(), 1);
        assertEq(vault.oldestBlockingRound(), 1);
        assertTrue(vault.shareOperationsFrozen());

        game.finalizeRound(1, 3_400, signatures);

        assertEq(vault.frozenRoundCount(), 0);
        assertEq(vault.oldestBlockingRound(), vault.NO_BLOCKING_ROUND());
        assertFalse(vault.shareOperationsFrozen());
    }

    function testOutOfOrderResolutionAdvancesOldestBlockingRound() public {
        _enter(0, ALICE, ONE_TUSD, 12_500);
        _enter(1, BOB, ONE_TUSD, 15_000);

        // Register next before current can already happen; also resolve higher id first.
        (, uint64 lock1,) = game.roundTimes(1);
        vm.warp(lock1);
        game.requestReveal(1);
        game.requestReveal(0);

        assertEq(vault.oldestBlockingRound(), 0);
        assertEq(vault.frozenRoundCount(), 2);

        bytes[] memory signatures = new bytes[](1);
        signatures[0] = hex"01";
        game.finalizeRound(1, 3_400, signatures);

        assertEq(vault.oldestBlockingRound(), 0);
        assertEq(vault.frozenRoundCount(), 1);
        assertTrue(vault.shareOperationsFrozen());

        (,, uint64 expires0) = game.roundTimes(0);
        vm.warp(expires0);
        game.expireRound(0);

        assertEq(vault.oldestBlockingRound(), vault.NO_BLOCKING_ROUND());
        assertEq(vault.frozenRoundCount(), 0);
        assertFalse(vault.shareOperationsFrozen());
    }

    function testRegisterNextBeforeCurrentKeepsAscendingOldest() public {
        // Enter round 1 first, then round 0 — insertion must keep ascending order.
        IncoRandomMock(address(inco)).configure(INCO_FEE, bytes32(uint256(0x1001)));
        vm.warp(EPOCH_ORIGIN);
        game.openRound{value: INCO_FEE}(1);
        vm.prank(BOB);
        game.enter(1, ONE_TUSD, 15_000);

        assertEq(vault.oldestBlockingRound(), 1);

        IncoRandomMock(address(inco)).configure(INCO_FEE, bytes32(uint256(0x1000)));
        game.openRound{value: INCO_FEE}(0);
        vm.prank(ALICE);
        game.enter(0, ONE_TUSD, 12_500);

        assertEq(vault.oldestBlockingRound(), 0);
        (bool present, uint64 expiresAt,, uint256 nextRoundId) = vault.getBlockingRound(0);
        assertTrue(present);
        assertEq(nextRoundId, 1);
        (,, uint64 expectedExpires) = game.roundTimes(0);
        assertEq(expiresAt, expectedExpires);
    }

    function testFreezeCounterRecoveryAcrossInterleavings(uint8 pattern) public {
        // Four overlapping exposed rounds; each step is reveal, finalize, or expire.
        // Pattern nibbles pick an action per round while skipping impossible transitions.
        uint256 roundCount = 3;
        for (uint256 i = 0; i < roundCount; ++i) {
            _enter(i, i % 2 == 0 ? ALICE : BOB, ONE_TUSD, 12_500);
        }

        bool[3] memory revealed;
        bool[3] memory resolved;
        bytes[] memory signatures = new bytes[](1);
        signatures[0] = hex"01";

        for (uint256 step = 0; step < 12; ++step) {
            uint256 roundId = (uint256(pattern) + step) % roundCount;
            if (resolved[roundId]) continue;

            (uint64 openAt, uint64 lockAt, uint64 expiresAt) = game.roundTimes(roundId);
            uint256 action = (uint256(pattern) >> (step % 5)) % 3;

            if (!revealed[roundId] && action == 0) {
                if (block.timestamp < lockAt) vm.warp(lockAt);
                if (block.timestamp >= expiresAt) {
                    game.expireRound(roundId);
                    resolved[roundId] = true;
                } else {
                    game.requestReveal(roundId);
                    revealed[roundId] = true;
                }
            } else if (revealed[roundId] && !resolved[roundId] && action == 1) {
                if (block.timestamp >= expiresAt) {
                    game.expireRound(roundId);
                } else {
                    game.finalizeRound(roundId, 2_080, signatures);
                }
                resolved[roundId] = true;
            } else if (!resolved[roundId] && action == 2) {
                if (block.timestamp < expiresAt) vm.warp(expiresAt);
                game.expireRound(roundId);
                resolved[roundId] = true;
            } else if (!revealed[roundId]) {
                if (block.timestamp < openAt) vm.warp(openAt);
                if (block.timestamp < lockAt) vm.warp(lockAt);
                if (block.timestamp >= expiresAt) {
                    game.expireRound(roundId);
                    resolved[roundId] = true;
                } else {
                    game.requestReveal(roundId);
                    revealed[roundId] = true;
                }
            } else {
                if (block.timestamp < expiresAt) vm.warp(expiresAt);
                game.expireRound(roundId);
                resolved[roundId] = true;
            }

            _assertFreezeInvariants();
        }

        for (uint256 i = 0; i < roundCount; ++i) {
            if (!resolved[i]) {
                (,, uint64 expiresAt) = game.roundTimes(i);
                if (block.timestamp < expiresAt) vm.warp(expiresAt);
                game.expireRound(i);
            }
        }

        assertEq(vault.frozenRoundCount(), 0);
        assertEq(vault.oldestBlockingRound(), vault.NO_BLOCKING_ROUND());
        assertFalse(vault.shareOperationsFrozen());
    }

    function testRealizedGamePnlTracksNetWinningAndLosingRounds() public {
        assertEq(vault.realizedGamePnl(), 0);

        // Losing ticket at 10x with low crash point → LP gain of margin.
        _enter(0, ALICE, ONE_TUSD, 100_000);
        (, uint64 lock0,) = game.roundTimes(0);
        vm.warp(lock0);
        game.requestReveal(0);
        bytes[] memory signatures = new bytes[](1);
        signatures[0] = hex"01";
        // plaintext 0 → crash well below 10x.
        game.finalizeRound(0, 0, signatures);
        assertEq(vault.realizedGamePnl(), int256(ONE_TUSD));

        // Winning 1.25x ticket → LP loss of payout − margin.
        _enter(1, BOB, ONE_TUSD, 12_500);
        (, uint64 lock1,) = game.roundTimes(1);
        vm.warp(lock1);
        game.requestReveal(1);
        game.finalizeRound(1, 2_080, signatures);
        assertEq(vault.realizedGamePnl(), int256(ONE_TUSD) + int256(ONE_TUSD) - int256(1_250_000));
    }

    function _assertFreezeInvariants() internal view {
        uint256 count;
        uint256 cursor = vault.oldestBlockingRound();
        uint256 previous = 0;
        bool hasPrevious;
        while (cursor != vault.NO_BLOCKING_ROUND()) {
            (bool present, uint64 expiresAt, bool revealFrozen, uint256 nextRoundId) = vault.getBlockingRound(cursor);
            assertTrue(present);
            if (hasPrevious) assertGt(cursor, previous);
            if (revealFrozen) ++count;
            if (vault.frozenRoundCount() == 0 && vault.shareOperationsFrozen()) {
                assertGe(block.timestamp, expiresAt);
            }
            previous = cursor;
            hasPrevious = true;
            cursor = nextRoundId;
        }
        assertEq(count, vault.frozenRoundCount());
        if (vault.frozenRoundCount() > 0) assertTrue(vault.shareOperationsFrozen());
        if (vault.oldestBlockingRound() == vault.NO_BLOCKING_ROUND()) {
            assertEq(vault.frozenRoundCount(), 0);
            assertFalse(vault.shareOperationsFrozen());
        }
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
}
