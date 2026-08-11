// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";

import {inco} from "@inco/lightning/src/Lib.sol";
import {ETypes, euint256} from "@inco/lightning/src/Types.sol";
import {MarginCallCrash} from "../src/MarginCallCrash.sol";

contract IncoRandomMock {
    uint256 public fee;
    bytes32 public randomHandle;
    bool public shouldRevertRandom;
    mapping(bytes32 handle => mapping(address account => bool isAllowed)) internal _transientAllowances;
    mapping(bytes32 handle => mapping(address account => bool isAllowed)) internal _persistentAllowances;

    function configure(uint256 fee_, bytes32 randomHandle_) external {
        fee = fee_;
        randomHandle = randomHandle_;
    }

    function setShouldRevertRandom(bool shouldRevertRandom_) external {
        shouldRevertRandom = shouldRevertRandom_;
    }

    function getFee() external view returns (uint256) {
        return fee;
    }

    function asEuint256(uint256 value) external pure returns (euint256) {
        return euint256.wrap(bytes32(value));
    }

    function eRandBounded(bytes32 upperBound, ETypes randomType) external payable returns (bytes32) {
        require(!shouldRevertRandom, "random failed");
        require(msg.value == fee, "wrong fee");
        require(upperBound == bytes32(uint256(10_000)), "wrong bound");
        require(randomType == ETypes.Uint256, "wrong type");
        _transientAllowances[randomHandle][msg.sender] = true;
        return randomHandle;
    }

    function allow(bytes32 handle, address account) external {
        require(
            _transientAllowances[handle][msg.sender] || _persistentAllowances[handle][msg.sender], "sender not allowed"
        );
        _persistentAllowances[handle][account] = true;
    }

    function persistAllowed(bytes32 handle, address account) external view returns (bool) {
        return _persistentAllowances[handle][account];
    }

    function isAllowed(bytes32 handle, address account) external view returns (bool) {
        return _transientAllowances[handle][account] || _persistentAllowances[handle][account];
    }
}

contract RejectingRoundOpener {
    function open(MarginCallCrash game, uint256 roundId) external payable {
        game.openRound{value: msg.value}(roundId);
    }

    receive() external payable {
        revert("refund rejected");
    }
}

contract ReentrantRoundOpener {
    MarginCallCrash internal immutable _game;
    uint256 internal immutable _reentryRoundId;
    uint256 internal immutable _fee;

    bool public attemptedReentry;
    bool public reentrySucceeded;

    constructor(MarginCallCrash game, uint256 reentryRoundId, uint256 fee) {
        _game = game;
        _reentryRoundId = reentryRoundId;
        _fee = fee;
    }

    function open(uint256 roundId) external payable {
        _game.openRound{value: msg.value}(roundId);
    }

    receive() external payable {
        if (attemptedReentry) return;
        attemptedReentry = true;
        (reentrySucceeded,) =
            address(_game).call{value: _fee}(abi.encodeCall(MarginCallCrash.openRound, (_reentryRoundId)));
    }
}

contract MarginCallCrashTest is Test {
    uint64 internal constant EPOCH_ORIGIN = 1_000_000;
    uint256 internal constant INCO_FEE = 1e12;
    bytes32 internal constant RANDOM_HANDLE = bytes32(uint256(0xCAFE));

    event RoundOpened(
        uint256 indexed roundId,
        address indexed opener,
        bytes32 crashRandom,
        uint64 openAt,
        uint64 lockAt,
        uint64 expiresAt
    );

    MarginCallCrash internal game;
    IncoRandomMock internal incoMock;

    function setUp() public {
        IncoRandomMock mock = new IncoRandomMock();
        vm.etch(address(inco), address(mock).code);
        incoMock = IncoRandomMock(address(inco));
        incoMock.configure(INCO_FEE, RANDOM_HANDLE);
        game = new MarginCallCrash(EPOCH_ORIGIN);
    }

    function testOpenRoundStoresOnePrecommittedHandle() public {
        vm.warp(EPOCH_ORIGIN);

        game.openRound{value: INCO_FEE}(0);

        MarginCallCrash.Round memory round = game.getRound(0);
        assertEq(uint256(round.status), uint256(MarginCallCrash.RoundStatus.Open));
        assertNotEq(round.crashRandom, bytes32(0));
        assertEq(round.openAt, EPOCH_ORIGIN);
        assertEq(round.lockAt, EPOCH_ORIGIN + 45);
        assertEq(round.expiresAt, EPOCH_ORIGIN + 45 + 15 minutes);
        assertEq(game.roundDuration(), 60);
        assertEq(game.entryWindow(), 45);
        assertEq(game.expiryDelay(), 15 minutes);
    }

    function testCallsBeforeEpochOriginRevert() public {
        vm.warp(EPOCH_ORIGIN - 1);

        vm.expectRevert(
            abi.encodeWithSelector(MarginCallCrash.EpochNotStarted.selector, EPOCH_ORIGIN - 1, EPOCH_ORIGIN)
        );
        game.currentRoundId();

        vm.expectRevert(
            abi.encodeWithSelector(MarginCallCrash.EpochNotStarted.selector, EPOCH_ORIGIN - 1, EPOCH_ORIGIN)
        );
        game.openRound{value: INCO_FEE}(0);
    }

    function testEpochGridAcceptsOnlyCurrentAndNextRound() public {
        vm.warp(EPOCH_ORIGIN + 3 minutes + 59);
        assertEq(game.currentRoundId(), 3);

        game.openRound{value: INCO_FEE}(3);
        game.openRound{value: INCO_FEE}(4);

        (uint64 openAt, uint64 lockAt, uint64 expiresAt) = game.roundTimes(4);
        assertEq(openAt, EPOCH_ORIGIN + 4 minutes);
        assertEq(lockAt, openAt + 45);
        assertEq(expiresAt, lockAt + 15 minutes);

        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.InvalidRoundId.selector, 2, 3));
        game.openRound{value: INCO_FEE}(2);

        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.InvalidRoundId.selector, 5, 3));
        game.openRound{value: INCO_FEE}(5);

        vm.warp(EPOCH_ORIGIN + 4 minutes);
        assertEq(game.currentRoundId(), 4);
    }

    function testRoundTimesRejectValuesThatDoNotFitStorage() public {
        uint256 overflowingRoundId = type(uint64).max / 60 + 1;

        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.RoundTimestampOverflow.selector, overflowingRoundId));
        game.roundTimes(overflowingRoundId);
    }

    function testFuzzRoundTimesFollowFixedGrid(uint32 roundId) public view {
        (uint64 openAt, uint64 lockAt, uint64 expiresAt) = game.roundTimes(roundId);

        assertEq(openAt, EPOCH_ORIGIN + uint256(roundId) * 60);
        assertEq(lockAt, openAt + 45);
        assertEq(expiresAt, lockAt + 15 minutes);
    }

    function testDuplicateInitializationCannotReplaceHandle() public {
        vm.warp(EPOCH_ORIGIN);
        game.openRound{value: INCO_FEE}(0);
        incoMock.configure(INCO_FEE, bytes32(uint256(0xBEEF)));

        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.RoundAlreadyInitialized.selector, 0));
        game.openRound{value: INCO_FEE}(0);

        assertEq(game.getRound(0).crashRandom, RANDOM_HANDLE);
    }

    function testUnderpaidIncoFeeRevertsWithoutRoundState() public {
        vm.warp(EPOCH_ORIGIN);

        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.InsufficientIncoFee.selector, INCO_FEE, INCO_FEE - 1));
        game.openRound{value: INCO_FEE - 1}(0);

        assertEq(uint256(game.getRound(0).status), uint256(MarginCallCrash.RoundStatus.Uninitialized));
        assertEq(address(game).balance, 0);
        assertEq(address(inco).balance, 0);
    }

    function testExactFeeIsForwardedAndNotRetained() public {
        address opener = makeAddr("opener");
        vm.deal(opener, INCO_FEE);
        vm.warp(EPOCH_ORIGIN);

        vm.prank(opener);
        game.openRound{value: INCO_FEE}(0);

        assertEq(opener.balance, 0);
        assertEq(address(inco).balance, INCO_FEE);
        assertEq(address(game).balance, 0);
    }

    function testExcessFeeIsRefundedAtomically() public {
        address opener = makeAddr("opener");
        uint256 excess = 0.4 ether;
        vm.deal(opener, INCO_FEE + excess);
        vm.warp(EPOCH_ORIGIN);

        vm.prank(opener);
        game.openRound{value: INCO_FEE + excess}(0);

        assertEq(opener.balance, excess);
        assertEq(address(inco).balance, INCO_FEE);
        assertEq(address(game).balance, 0);
    }

    function testPreExistingEthCannotFundCreationOrChangeRefund() public {
        uint256 forcedBalance = 10 ether;
        vm.deal(address(game), forcedBalance);
        vm.warp(EPOCH_ORIGIN);

        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.InsufficientIncoFee.selector, INCO_FEE, 0));
        game.openRound(0);

        uint256 excess = 0.25 ether;
        address opener = makeAddr("opener");
        vm.deal(opener, INCO_FEE + excess);
        vm.prank(opener);
        game.openRound{value: INCO_FEE + excess}(0);

        assertEq(opener.balance, excess);
        assertEq(address(game).balance, forcedBalance);
        assertEq(address(inco).balance, INCO_FEE);
    }

    function testRoundOpenedEventReconstructsStoredRound() public {
        address opener = makeAddr("opener");
        vm.deal(opener, INCO_FEE);
        vm.warp(EPOCH_ORIGIN + 30);

        vm.expectEmit(true, true, false, true, address(game));
        emit RoundOpened(0, opener, RANDOM_HANDLE, EPOCH_ORIGIN, EPOCH_ORIGIN + 45, EPOCH_ORIGIN + 45 + 15 minutes);

        vm.prank(opener);
        game.openRound{value: INCO_FEE}(0);
    }

    function testIncoFailureLeavesNoPartialRoundState() public {
        vm.warp(EPOCH_ORIGIN);
        incoMock.setShouldRevertRandom(true);

        vm.expectRevert(bytes("random failed"));
        game.openRound{value: INCO_FEE}(0);

        assertEq(uint256(game.getRound(0).status), uint256(MarginCallCrash.RoundStatus.Uninitialized));
        assertEq(address(game).balance, 0);
        assertEq(address(inco).balance, 0);
    }

    function testZeroIncoHandleLeavesNoPartialRoundState() public {
        vm.warp(EPOCH_ORIGIN);
        incoMock.configure(INCO_FEE, bytes32(0));

        vm.expectRevert(MarginCallCrash.InvalidIncoHandle.selector);
        game.openRound{value: INCO_FEE}(0);

        assertEq(uint256(game.getRound(0).status), uint256(MarginCallCrash.RoundStatus.Uninitialized));
        assertEq(address(game).balance, 0);
        assertEq(address(inco).balance, 0);
    }

    function testRefundFailureRevertsEntireInitialization() public {
        RejectingRoundOpener opener = new RejectingRoundOpener();
        uint256 excess = 1 ether;
        vm.deal(address(this), INCO_FEE + excess);
        vm.warp(EPOCH_ORIGIN);

        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.EthRefundFailed.selector, address(opener), excess));
        opener.open{value: INCO_FEE + excess}(game, 0);

        assertEq(uint256(game.getRound(0).status), uint256(MarginCallCrash.RoundStatus.Uninitialized));
        assertEq(address(game).balance, 0);
        assertEq(address(inco).balance, 0);
    }

    function testRefundReentrancyCannotInitializeAnotherRound() public {
        ReentrantRoundOpener opener = new ReentrantRoundOpener(game, 1, INCO_FEE);
        vm.deal(address(this), INCO_FEE * 2);
        vm.warp(EPOCH_ORIGIN);

        opener.open{value: INCO_FEE * 2}(0);

        assertTrue(opener.attemptedReentry());
        assertFalse(opener.reentrySucceeded());
        assertEq(uint256(game.getRound(0).status), uint256(MarginCallCrash.RoundStatus.Open));
        assertEq(uint256(game.getRound(1).status), uint256(MarginCallCrash.RoundStatus.Uninitialized));
        assertEq(address(game).balance, 0);
        assertEq(address(inco).balance, INCO_FEE);
    }

    function testOpenerReceivesNoEarlyDecryptionPermission() public {
        address opener = makeAddr("opener");
        vm.deal(opener, INCO_FEE);
        vm.warp(EPOCH_ORIGIN);

        vm.prank(opener);
        game.openRound{value: INCO_FEE}(0);

        assertTrue(incoMock.persistAllowed(RANDOM_HANDLE, address(game)));
        assertTrue(incoMock.isAllowed(RANDOM_HANDLE, address(game)));
        assertFalse(incoMock.isAllowed(RANDOM_HANDLE, opener));
        assertFalse(incoMock.isAllowed(RANDOM_HANDLE, address(this)));
    }
}
