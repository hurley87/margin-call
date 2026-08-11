// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";

import {inco} from "@inco/lightning/src/Lib.sol";
import {ETypes, euint256} from "@inco/lightning/src/Types.sol";

import {BankrollVault} from "../src/BankrollVault.sol";
import {DeskDollars} from "../src/DeskDollars.sol";
import {IBankrollVault} from "../src/interfaces/IBankrollVault.sol";
import {MarginCallCrash} from "../src/MarginCallCrash.sol";

contract IncoRandomMock {
    uint256 public fee;
    bytes32 public randomHandle;
    mapping(bytes32 handle => mapping(address account => bool isAllowed)) internal _transientAllowances;
    mapping(bytes32 handle => mapping(address account => bool isAllowed)) internal _persistentAllowances;

    function configure(uint256 fee_, bytes32 randomHandle_) external {
        fee = fee_;
        randomHandle = randomHandle_;
    }

    function getFee() external view returns (uint256) {
        return fee;
    }

    function asEuint256(uint256 value) external pure returns (euint256) {
        return euint256.wrap(bytes32(value));
    }

    function eRandBounded(bytes32, ETypes) external payable returns (bytes32) {
        require(msg.value == fee, "wrong fee");
        _transientAllowances[randomHandle][msg.sender] = true;
        return randomHandle;
    }

    function allow(bytes32 handle, address account) external {
        require(
            _transientAllowances[handle][msg.sender] || _persistentAllowances[handle][msg.sender], "sender not allowed"
        );
        _persistentAllowances[handle][account] = true;
    }
}

contract EntryIntegrationTest is Test {
    uint64 internal constant EPOCH_ORIGIN = 1_000_000;
    uint256 internal constant INCO_FEE = 1e12;
    bytes32 internal constant RANDOM_HANDLE = bytes32(uint256(0xCAFE));
    uint256 internal constant ONE_TUSD = 1_000_000;

    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant LP = address(0x1A);

    event TicketEntered(
        uint256 indexed roundId,
        uint256 indexed ticketId,
        address indexed player,
        uint256 margin,
        uint256 leverageBps,
        uint256 reservedPayout
    );
    event LiabilityReserved(
        uint256 indexed roundId,
        uint256 indexed ticketId,
        address indexed player,
        uint256 margin,
        uint256 maximumPayout,
        uint256 leverageBps
    );

    DeskDollars internal token;
    BankrollVault internal vault;
    MarginCallCrash internal game;

    function setUp() public {
        IncoRandomMock mock = new IncoRandomMock();
        vm.etch(address(inco), address(mock).code);
        IncoRandomMock(address(inco)).configure(INCO_FEE, RANDOM_HANDLE);

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

    function testUnauthorizedAcceptEntryReverts() public {
        vm.expectRevert(abi.encodeWithSelector(BankrollVault.UnauthorizedGameCaller.selector, address(this)));
        vault.acceptEntry(0, 1, ALICE, ONE_TUSD, 12_500, ONE_TUSD + ONE_TUSD / 4);
    }

    function testSetAuthorizedGameIsSetOnce() public {
        BankrollVault freshVault = new BankrollVault(token);
        freshVault.setAuthorizedGame(address(0x1111));

        vm.expectRevert(BankrollVault.AuthorizedGameAlreadySet.selector);
        freshVault.setAuthorizedGame(address(0x2222));
    }

    function testEnterAcceptsExactMarginsAndTiersAndAggregatesByTier() public {
        game.openRound{value: INCO_FEE}(0);

        uint256[3] memory margins = [ONE_TUSD, 5 * ONE_TUSD, 10 * ONE_TUSD];
        uint256[6] memory tiers = [uint256(12_500), 15_000, 20_000, 30_000, 50_000, 100_000];
        uint256 ticketCount;

        for (uint256 i = 0; i < margins.length; ++i) {
            for (uint256 j = 0; j < tiers.length; ++j) {
                address player = address(uint160(1_000 + i * 6 + j));
                uint256 expectedPayout = (margins[i] * tiers[j]) / 10_000;
                uint256 tierBefore = vault.reservedPayoutByRoundAndTier(0, tiers[j]);

                vm.prank(LP);
                assertTrue(token.transfer(player, margins[i]));
                vm.prank(player);
                token.approve(address(vault), margins[i]);
                vm.prank(player);
                game.enter(0, margins[i], tiers[j]);

                ++ticketCount;
                uint256 ticketId = game.getTicketId(0, player);
                MarginCallCrash.Ticket memory ticket = game.getTicket(ticketId);
                assertEq(ticket.margin, margins[i]);
                assertEq(ticket.leverageBps, tiers[j]);
                assertEq(ticket.reservedPayout, expectedPayout);
                assertEq(vault.reservedPayoutByRoundAndTier(0, tiers[j]), tierBefore + expectedPayout);
            }
        }

        assertEq(ticketCount, 18);
        assertEq(game.getRound(0).totalMargin, (1 + 5 + 10) * ONE_TUSD * 6);
    }

    function testEnterRejectsInvalidMarginAndLeverage() public {
        game.openRound{value: INCO_FEE}(0);

        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.InvalidMargin.selector, 2 * ONE_TUSD));
        game.enter(0, 2 * ONE_TUSD, 12_500);

        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.InvalidLeverageTier.selector, 12_499));
        game.enter(0, ONE_TUSD, 12_499);
    }

    function testOneTicketPerWalletPerRound() public {
        game.openRound{value: INCO_FEE}(0);

        vm.prank(ALICE);
        game.enter(0, ONE_TUSD, 12_500);

        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.TicketAlreadyExists.selector, 0, ALICE));
        game.enter(0, ONE_TUSD, 15_000);
    }

    function testEntryClosesAtLock() public {
        game.openRound{value: INCO_FEE}(0);
        vm.warp(EPOCH_ORIGIN + 45);

        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(MarginCallCrash.EntryClosed.selector, 0, EPOCH_ORIGIN + 45, EPOCH_ORIGIN + 45)
        );
        game.enter(0, ONE_TUSD, 12_500);
    }

    function testEntrySucceedsOneSecondBeforeLock() public {
        game.openRound{value: INCO_FEE}(0);
        vm.warp(EPOCH_ORIGIN + 44);

        vm.prank(ALICE);
        game.enter(0, ONE_TUSD, 12_500);
        assertEq(game.getTicketId(0, ALICE), 1);
    }

    function testMarginFlowsDirectlyToVaultAndNeverToGame() public {
        game.openRound{value: INCO_FEE}(0);
        uint256 aliceBefore = token.balanceOf(ALICE);
        uint256 vaultBefore = token.balanceOf(address(vault));

        vm.prank(ALICE);
        game.enter(0, 10 * ONE_TUSD, 20_000);

        assertEq(token.balanceOf(ALICE), aliceBefore - 10 * ONE_TUSD);
        assertEq(token.balanceOf(address(vault)), vaultBefore + 10 * ONE_TUSD);
        assertEq(token.balanceOf(address(game)), 0);
    }

    function testEntryIsPricingNeutral() public {
        game.openRound{value: INCO_FEE}(0);
        uint256 assetsPerShareBefore = vault.assetsPerShare();
        uint256 totalAssetsBefore = vault.totalAssets();

        vm.prank(ALICE);
        game.enter(0, 10 * ONE_TUSD, 100_000);

        assertEq(vault.assetsPerShare(), assetsPerShareBefore);
        assertEq(vault.totalAssets(), totalAssetsBefore);
        assertEq(vault.unrecognizedMargin(), 10 * ONE_TUSD);
        assertEq(vault.reservedLiabilities(), 100 * ONE_TUSD);
        assertEq(vault.grossAssets(), 12_000 * ONE_TUSD + 10 * ONE_TUSD);
    }

    function testEntryRejectedBelowGrossAssetFloor() public {
        uint256 maxAssets = vault.maxWithdraw(LP);
        vm.prank(LP);
        vault.withdraw(maxAssets, LP, LP);
        assertLt(vault.grossAssets() + ONE_TUSD, 10_000 * ONE_TUSD);

        game.openRound{value: INCO_FEE}(0);
        uint256 expectedGross = vault.grossAssets() + ONE_TUSD;

        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(BankrollVault.EntryFloorNotMet.selector, expectedGross, 10_000 * ONE_TUSD)
        );
        game.enter(0, ONE_TUSD, 12_500);

        assertEq(game.getTicketId(0, ALICE), 0);
        assertEq(token.balanceOf(address(game)), 0);
    }

    function testEntryRejectedWhenRoundReservationExceedsTwentyFivePercent() public {
        game.openRound{value: INCO_FEE}(0);

        // 25% of growing gross starting at 12_000. Each 10 tUSD x 10.00x reserves 100 tUSD.
        // After N tickets, assets ~= 12000 + 10N, limit ~= 0.25 * assets, reserved = 100N.
        // Solve 100N <= 0.25*(12000+10N) => 100N <= 3000 + 2.5N => 97.5N <= 3000 => N <= 30.
        // The 31st ticket must revert.
        for (uint256 i = 0; i < 30; ++i) {
            address player = address(uint160(10_000 + i));
            vm.prank(LP);
            assertTrue(token.transfer(player, 10 * ONE_TUSD));
            vm.prank(player);
            token.approve(address(vault), 10 * ONE_TUSD);
            vm.prank(player);
            game.enter(0, 10 * ONE_TUSD, 100_000);
        }

        address overflowPlayer = address(uint160(20_000));
        vm.prank(LP);
        assertTrue(token.transfer(overflowPlayer, 10 * ONE_TUSD));
        vm.prank(overflowPlayer);
        token.approve(address(vault), 10 * ONE_TUSD);

        uint256 assetsAfter = vault.grossAssets() + 10 * ONE_TUSD;
        uint256 limit = (assetsAfter * 25) / 100;
        uint256 reservedAfter = vault.reservedPayoutByRound(0) + 100 * ONE_TUSD;
        vm.prank(overflowPlayer);
        vm.expectRevert(
            abi.encodeWithSelector(BankrollVault.RoundReservationExceeded.selector, 0, reservedAfter, limit)
        );
        game.enter(0, 10 * ONE_TUSD, 100_000);

        assertEq(game.getTicketId(0, overflowPlayer), 0);
        assertEq(token.balanceOf(overflowPlayer), 10 * ONE_TUSD);
    }

    function testTicketReservationHardCapIsEnforced() public {
        game.openRound{value: INCO_FEE}(0);

        vm.prank(address(game));
        vm.expectRevert(
            abi.encodeWithSelector(BankrollVault.TicketReservationExceeded.selector, 101 * ONE_TUSD, 100 * ONE_TUSD)
        );
        vault.acceptEntry(0, 99, ALICE, 10 * ONE_TUSD, 100_000, 101 * ONE_TUSD);
    }

    function testInsufficientFreeLiquidityRevertsAndRollsBack() public {
        // reservedLiabilities is global while the 25% cap is per-round. Fill several rounds until
        // another max-size reservation cannot clear the safety buffer.
        for (uint256 roundId = 0; roundId < 5; ++roundId) {
            vm.warp(EPOCH_ORIGIN + roundId * 60);
            game.openRound{value: INCO_FEE}(roundId);

            for (uint256 i = 0; i < 40; ++i) {
                uint256 projectedAssets = vault.grossAssets() + 10 * ONE_TUSD;
                uint256 projectedBuffer = (projectedAssets * 20 + 99) / 100;
                if (vault.reservedLiabilities() + 100 * ONE_TUSD + projectedBuffer > projectedAssets) {
                    break;
                }
                uint256 roundLimit = (projectedAssets * 25) / 100;
                if (vault.reservedPayoutByRound(roundId) + 100 * ONE_TUSD > roundLimit) {
                    break;
                }

                address player = address(uint160(50_000 + roundId * 100 + i));
                vm.prank(LP);
                assertTrue(token.transfer(player, 10 * ONE_TUSD));
                vm.prank(player);
                token.approve(address(vault), 10 * ONE_TUSD);
                vm.prank(player);
                game.enter(roundId, 10 * ONE_TUSD, 100_000);
            }
        }

        uint256 aliceBefore = token.balanceOf(ALICE);
        uint256 reservedBefore = vault.reservedLiabilities();
        uint256 unrecognizedBefore = vault.unrecognizedMargin();
        uint256 assetsAfter = vault.grossAssets() + ONE_TUSD;
        uint256 bufferAfter = (assetsAfter * 20 + 99) / 100;
        uint256 freeLiquidityAfterEntry =
            assetsAfter > reservedBefore + bufferAfter ? assetsAfter - reservedBefore - bufferAfter : 0;

        assertLt(freeLiquidityAfterEntry, 99 * ONE_TUSD);

        vm.prank(address(game));
        vm.expectRevert(
            abi.encodeWithSelector(
                BankrollVault.InsufficientFreeLiquidity.selector, freeLiquidityAfterEntry, 99 * ONE_TUSD
            )
        );
        vault.acceptEntry(999, 999, ALICE, ONE_TUSD, 100_000, 100 * ONE_TUSD);

        assertEq(token.balanceOf(ALICE), aliceBefore);
        assertEq(vault.reservedLiabilities(), reservedBefore);
        assertEq(vault.unrecognizedMargin(), unrecognizedBefore);
        assertFalse(vault.getReservation(999).exists);
    }

    function testTicketEnteredAndLiabilityReservedAreReconstructable() public {
        game.openRound{value: INCO_FEE}(0);
        uint256 margin = 5 * ONE_TUSD;
        uint256 leverageBps = 30_000;
        uint256 reservedPayout = (margin * leverageBps) / 10_000;

        vm.expectEmit(true, true, true, true, address(vault));
        emit LiabilityReserved(0, 1, ALICE, margin, reservedPayout, leverageBps);
        vm.expectEmit(true, true, true, true, address(game));
        emit TicketEntered(0, 1, ALICE, margin, leverageBps, reservedPayout);

        vm.prank(ALICE);
        game.enter(0, margin, leverageBps);

        MarginCallCrash.Ticket memory ticket = game.getTicket(1);
        BankrollVault.TicketReservation memory reservation = vault.getReservation(1);
        assertEq(ticket.id, 1);
        assertEq(ticket.player, ALICE);
        assertEq(ticket.roundId, 0);
        assertEq(ticket.margin, margin);
        assertEq(ticket.leverageBps, leverageBps);
        assertEq(ticket.reservedPayout, reservedPayout);
        assertEq(reservation.roundId, 0);
        assertEq(reservation.player, ALICE);
        assertEq(reservation.margin, margin);
        assertEq(reservation.maximumPayout, reservedPayout);
        assertEq(reservation.leverageBps, leverageBps);
        assertTrue(reservation.exists);
    }

    function testLazyEnterCreatesRoundThenAcceptsTicket() public {
        vm.prank(ALICE);
        game.enter{value: INCO_FEE}(0, ONE_TUSD, 12_500);

        MarginCallCrash.Round memory round = game.getRound(0);
        assertEq(uint256(round.status), uint256(MarginCallCrash.RoundStatus.Open));
        assertEq(round.totalMargin, ONE_TUSD);
        assertEq(game.getTicketId(0, ALICE), 1);
        assertEq(address(game).balance, 0);
    }

    function testFeeBearingEnterRefundsWhenRoundAlreadyOpen() public {
        game.openRound{value: INCO_FEE}(0);
        uint256 aliceEthBefore = ALICE.balance;

        vm.prank(ALICE);
        game.enter{value: INCO_FEE}(0, ONE_TUSD, 12_500);

        assertEq(ALICE.balance, aliceEthBefore);
        assertEq(game.getTicketId(0, ALICE), 1);
        assertEq(address(game).balance, 0);
    }

    function testOpenRoundThenEnterSameBlock() public {
        game.openRound{value: INCO_FEE}(0);
        vm.prank(ALICE);
        game.enter(0, ONE_TUSD, 12_500);

        assertEq(uint256(game.getRound(0).status), uint256(MarginCallCrash.RoundStatus.Open));
        assertEq(game.getTicketId(0, ALICE), 1);
    }

    function testEnterThenOpenRoundSameBlockOpenRoundReverts() public {
        vm.prank(ALICE);
        game.enter{value: INCO_FEE}(0, ONE_TUSD, 12_500);

        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.RoundAlreadyInitialized.selector, 0));
        game.openRound{value: INCO_FEE}(0);
    }

    function testTwoSimultaneousRoundCreatingEntriesConsumeExactlyOneFee() public {
        uint256 feeBalanceBefore = address(inco).balance;

        vm.prank(ALICE);
        game.enter{value: INCO_FEE}(0, ONE_TUSD, 12_500);

        uint256 bobEthBefore = BOB.balance;
        vm.prank(BOB);
        game.enter{value: INCO_FEE}(0, ONE_TUSD, 15_000);

        assertEq(address(inco).balance, feeBalanceBefore + INCO_FEE);
        assertEq(BOB.balance, bobEthBefore);
        assertEq(game.getTicketId(0, ALICE), 1);
        assertEq(game.getTicketId(0, BOB), 2);
        assertEq(address(game).balance, 0);
    }

    function testForcedEthCannotFundRoundCreationOrChangeRefunds() public {
        vm.deal(address(game), 5 ether);
        uint256 forcedBefore = address(game).balance;

        vm.prank(ALICE);
        game.enter{value: INCO_FEE}(0, ONE_TUSD, 12_500);

        assertEq(address(game).balance, forcedBefore);
        assertEq(game.getTicketId(0, ALICE), 1);
    }
}
