// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

import {inco} from "@inco/lightning/src/Lib.sol";
import {ETypes, euint256} from "@inco/lightning/src/Types.sol";
import {DecryptionAttestation} from "@inco/lightning/src/lightning-parts/DecryptionAttester.types.sol";
import {MarginCallCrash} from "../src/MarginCallCrash.sol";

contract IncoVerifierMock {
    bool public validAttestation = true;
    bytes32 public expectedHandle;
    uint256 public expectedValue;
    bool public enforceExpected;

    function setValidAttestation(bool validAttestation_) external {
        validAttestation = validAttestation_;
    }

    function setExpectedAttestation(bytes32 handle, uint256 value) external {
        expectedHandle = handle;
        expectedValue = value;
        enforceExpected = true;
    }

    function isValidDecryptionAttestation(DecryptionAttestation memory decryption, bytes[] calldata)
        external
        view
        returns (bool)
    {
        if (!validAttestation) return false;
        if (!enforceExpected) return true;
        return decryption.handle == expectedHandle && uint256(decryption.value) == expectedValue;
    }
}

contract IncoRandomMock {
    uint256 public fee;
    bytes32 public randomHandle;
    bool public shouldRevertRandom;
    address public verifier;
    mapping(bytes32 handle => mapping(address account => bool isAllowed)) internal _transientAllowances;
    mapping(bytes32 handle => mapping(address account => bool isAllowed)) internal _persistentAllowances;
    mapping(bytes32 handle => bool isRevealed) public revealed;

    function configure(uint256 fee_, bytes32 randomHandle_) external {
        fee = fee_;
        randomHandle = randomHandle_;
    }

    function setVerifier(address verifier_) external {
        verifier = verifier_;
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

    function reveal(bytes32 handle) external {
        require(
            _transientAllowances[handle][msg.sender] || _persistentAllowances[handle][msg.sender], "sender not allowed"
        );
        revealed[handle] = true;
    }

    function incoVerifier() external view returns (address) {
        return verifier;
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
    bytes32 internal constant ROUND_ONE_HANDLE = bytes32(uint256(0xBEEF));
    bytes32 internal constant ROUND_TWO_HANDLE = bytes32(uint256(0xFACE));

    event RoundOpened(
        uint256 indexed roundId,
        address indexed opener,
        bytes32 crashRandom,
        uint64 openAt,
        uint64 lockAt,
        uint64 expiresAt
    );
    event RevealRequested(uint256 indexed roundId, bytes32 crashRandom);
    event RoundFinalized(uint256 indexed roundId, bytes32 crashRandom, uint256 crashPointBps);
    event RoundExpired(uint256 indexed roundId);

    MarginCallCrash internal game;
    IncoRandomMock internal incoMock;
    IncoVerifierMock internal verifierMock;

    function setUp() public {
        IncoRandomMock mock = new IncoRandomMock();
        vm.etch(address(inco), address(mock).code);
        incoMock = IncoRandomMock(address(inco));
        incoMock.configure(INCO_FEE, RANDOM_HANDLE);

        verifierMock = new IncoVerifierMock();
        incoMock.setVerifier(address(verifierMock));

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

    function testRequestRevealBoundariesAndIdempotence() public {
        _openRound(0);
        uint64 lockAt = EPOCH_ORIGIN + 45;
        uint64 expiresAt = lockAt + 15 minutes;

        vm.warp(lockAt - 1);
        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.RevealBeforeLock.selector, 0, lockAt, lockAt - 1));
        game.requestReveal(0);

        vm.warp(lockAt);
        vm.expectEmit(true, false, false, true, address(game));
        emit RevealRequested(0, RANDOM_HANDLE);
        game.requestReveal(0);
        assertTrue(incoMock.revealed(RANDOM_HANDLE));
        assertEq(uint256(game.getRound(0).status), uint256(MarginCallCrash.RoundStatus.RevealRequested));

        // Workflow-level idempotence: a second reveal request is a no-op before expiry.
        game.requestReveal(0);
        assertEq(uint256(game.getRound(0).status), uint256(MarginCallCrash.RoundStatus.RevealRequested));

        vm.warp(expiresAt - 1);
        game.requestReveal(0);

        vm.warp(expiresAt);
        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.LifecycleAfterExpiry.selector, 0, expiresAt, expiresAt));
        game.requestReveal(0);
    }

    function testFinalizeRoundStoresCrashPointAndRejectsInvalidAttestations() public {
        _openRound(0);
        _requestRevealAtLock(0);

        bytes[] memory signatures = _signatures();
        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.RandomOutOfRange.selector, 10_000));
        game.finalizeRound(0, 10_000, signatures);

        verifierMock.setValidAttestation(false);
        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.InvalidAttestation.selector, 0));
        game.finalizeRound(0, 42, signatures);
        assertEq(uint256(game.getRound(0).status), uint256(MarginCallCrash.RoundStatus.RevealRequested));
        assertEq(game.getRound(0).crashPointBps, 0);

        verifierMock.setValidAttestation(true);
        verifierMock.setExpectedAttestation(RANDOM_HANDLE, 0);
        vm.expectEmit(true, false, false, true, address(game));
        emit RoundFinalized(0, RANDOM_HANDLE, 9_900);
        game.finalizeRound(0, 0, signatures);

        MarginCallCrash.Round memory round = game.getRound(0);
        assertEq(uint256(round.status), uint256(MarginCallCrash.RoundStatus.Finalized));
        assertEq(round.crashPointBps, 9_900);

        vm.expectRevert(
            abi.encodeWithSelector(
                MarginCallCrash.InvalidRoundStatus.selector, 0, MarginCallCrash.RoundStatus.Finalized
            )
        );
        game.finalizeRound(0, 0, signatures);
    }

    function testFinalizeBindsExactStoredHandle() public {
        incoMock.configure(INCO_FEE, RANDOM_HANDLE);
        _openRound(0);
        incoMock.configure(INCO_FEE, ROUND_ONE_HANDLE);
        _openRound(1);
        _requestRevealAtLock(1);

        bytes[] memory signatures = _signatures();
        // A verifier proof for round 0's handle cannot finalize round 1.
        verifierMock.setExpectedAttestation(RANDOM_HANDLE, 7);
        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.InvalidAttestation.selector, 1));
        game.finalizeRound(1, 7, signatures);
        assertEq(uint256(game.getRound(1).status), uint256(MarginCallCrash.RoundStatus.RevealRequested));

        verifierMock.setExpectedAttestation(ROUND_ONE_HANDLE, 7);
        game.finalizeRound(1, 7, signatures);
        assertEq(uint256(game.getRound(1).status), uint256(MarginCallCrash.RoundStatus.Finalized));
        assertEq(game.getRound(1).crashRandom, ROUND_ONE_HANDLE);
    }

    function testCrashPointFormulaBoundaries() public {
        assertEq(_finalizeWithRandom(0), 9_900);
        assertEq(_finalizeWithRandom(9_009), 99_899);
        assertEq(_finalizeWithRandom(9_010), 100_000);
        assertEq(_finalizeWithRandom(9_011), 100_000);
        assertEq(_finalizeWithRandom(9_999), 100_000);
    }

    function testExpireRoundBoundariesFromOpenAndRevealRequested() public {
        _openRound(0);
        uint64 expiresAt = EPOCH_ORIGIN + 45 + 15 minutes;

        vm.warp(expiresAt - 1);
        vm.expectRevert(
            abi.encodeWithSelector(MarginCallCrash.ExpireBeforeExpiry.selector, 0, expiresAt, expiresAt - 1)
        );
        game.expireRound(0);

        vm.warp(expiresAt);
        vm.expectEmit(true, false, false, true, address(game));
        emit RoundExpired(0);
        game.expireRound(0);
        assertEq(uint256(game.getRound(0).status), uint256(MarginCallCrash.RoundStatus.Expired));

        vm.expectRevert(
            abi.encodeWithSelector(MarginCallCrash.InvalidRoundStatus.selector, 0, MarginCallCrash.RoundStatus.Expired)
        );
        game.expireRound(0);

        _openRound(1);
        _requestRevealAtLock(1);
        (,, uint64 roundOneExpiresAt) = game.roundTimes(1);
        vm.warp(roundOneExpiresAt);
        game.expireRound(1);
        assertEq(uint256(game.getRound(1).status), uint256(MarginCallCrash.RoundStatus.Expired));
    }

    function testSameBlockFinalizeAndExpireAreMutuallyExclusive() public {
        _openRound(0);
        _requestRevealAtLock(0);
        uint64 expiresAt = EPOCH_ORIGIN + 45 + 15 minutes;
        bytes[] memory signatures = _signatures();

        vm.warp(expiresAt - 1);
        vm.expectRevert(
            abi.encodeWithSelector(MarginCallCrash.ExpireBeforeExpiry.selector, 0, expiresAt, expiresAt - 1)
        );
        game.expireRound(0);
        game.finalizeRound(0, 7, signatures);
        assertEq(uint256(game.getRound(0).status), uint256(MarginCallCrash.RoundStatus.Finalized));

        vm.warp(expiresAt);
        vm.expectRevert(
            abi.encodeWithSelector(
                MarginCallCrash.InvalidRoundStatus.selector, 0, MarginCallCrash.RoundStatus.Finalized
            )
        );
        game.expireRound(0);

        _openRound(1);
        _requestRevealAtLock(1);
        (,, uint64 roundOneExpiresAt) = game.roundTimes(1);

        vm.warp(roundOneExpiresAt);
        vm.expectRevert(
            abi.encodeWithSelector(
                MarginCallCrash.LifecycleAfterExpiry.selector, 1, roundOneExpiresAt, roundOneExpiresAt
            )
        );
        game.finalizeRound(1, 7, signatures);
        game.expireRound(1);
        assertEq(uint256(game.getRound(1).status), uint256(MarginCallCrash.RoundStatus.Expired));
        vm.expectRevert(
            abi.encodeWithSelector(
                MarginCallCrash.LifecycleAfterExpiry.selector, 1, roundOneExpiresAt, roundOneExpiresAt
            )
        );
        game.finalizeRound(1, 7, signatures);
    }

    function testThreeOverlappingRoundsAdvanceIndependently() public {
        _openRound(0);
        incoMock.configure(INCO_FEE, ROUND_ONE_HANDLE);
        _openRound(1);

        vm.warp(EPOCH_ORIGIN + 60);
        incoMock.configure(INCO_FEE, ROUND_TWO_HANDLE);
        game.openRound{value: INCO_FEE}(2);

        vm.warp(EPOCH_ORIGIN + 45);
        game.requestReveal(0);

        vm.warp(EPOCH_ORIGIN + 60 + 45);
        game.requestReveal(1);
        game.finalizeRound(1, 0, _signatures());

        vm.warp(EPOCH_ORIGIN + 45 + 15 minutes);
        game.expireRound(0);

        assertEq(uint256(game.getRound(0).status), uint256(MarginCallCrash.RoundStatus.Expired));
        assertEq(uint256(game.getRound(1).status), uint256(MarginCallCrash.RoundStatus.Finalized));
        assertEq(game.getRound(1).crashPointBps, 9_900);
        assertEq(uint256(game.getRound(2).status), uint256(MarginCallCrash.RoundStatus.Open));
        assertFalse(incoMock.revealed(ROUND_TWO_HANDLE));
    }

    function testUntouchedEpochCreatesNoStateAndNeedsNoMaintenance() public view {
        assertEq(uint256(game.getRound(9).status), uint256(MarginCallCrash.RoundStatus.Uninitialized));
        assertEq(game.getRound(9).crashRandom, bytes32(0));
        assertEq(game.getRound(9).crashPointBps, 0);
    }

    function testUntouchedEpochRejectsLifecycleTransitions() public {
        vm.warp(EPOCH_ORIGIN + 45);

        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.RoundNotInitialized.selector, 9));
        game.requestReveal(9);

        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.RoundNotInitialized.selector, 9));
        game.finalizeRound(9, 0, _signatures());

        vm.warp(EPOCH_ORIGIN + 45 + 15 minutes);
        vm.expectRevert(abi.encodeWithSelector(MarginCallCrash.RoundNotInitialized.selector, 9));
        game.expireRound(9);
    }

    function testLifecycleEventsReconstructRoundWithoutTraces() public {
        _openRound(0);

        vm.recordLogs();
        _requestRevealAtLock(0);
        game.finalizeRound(0, 42, _signatures());

        Vm.Log[] memory entries = vm.getRecordedLogs();
        bool sawReveal;
        bool sawFinalize;
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].topics[0] == RevealRequested.selector) {
                assertEq(uint256(entries[i].topics[1]), 0);
                (bytes32 crashRandom) = abi.decode(entries[i].data, (bytes32));
                assertEq(crashRandom, RANDOM_HANDLE);
                sawReveal = true;
            }
            if (entries[i].topics[0] == RoundFinalized.selector) {
                assertEq(uint256(entries[i].topics[1]), 0);
                (bytes32 crashRandom, uint256 crashPointBps) = abi.decode(entries[i].data, (bytes32, uint256));
                assertEq(crashRandom, RANDOM_HANDLE);
                assertEq(crashPointBps, 9_941);
                sawFinalize = true;
            }
        }
        assertTrue(sawReveal);
        assertTrue(sawFinalize);

        vm.recordLogs();
        _openRound(1);
        _requestRevealAtLock(1);
        (,, uint64 expiresAt) = game.roundTimes(1);
        vm.warp(expiresAt);
        game.expireRound(1);
        entries = vm.getRecordedLogs();
        bool sawExpire;
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].topics[0] == RoundExpired.selector) {
                assertEq(uint256(entries[i].topics[1]), 1);
                sawExpire = true;
            }
        }
        assertTrue(sawExpire);
    }

    function testFinalizeRequiresPriorRevealRequest() public {
        _openRound(0);
        vm.warp(EPOCH_ORIGIN + 45);

        vm.expectRevert(
            abi.encodeWithSelector(MarginCallCrash.InvalidRoundStatus.selector, 0, MarginCallCrash.RoundStatus.Open)
        );
        game.finalizeRound(0, 0, _signatures());
    }

    function _openRound(uint256 roundId) internal {
        (uint64 openAt,,) = game.roundTimes(roundId);
        vm.warp(openAt);
        game.openRound{value: INCO_FEE}(roundId);
    }

    function _requestRevealAtLock(uint256 roundId) internal {
        (, uint64 lockAt,) = game.roundTimes(roundId);
        vm.warp(lockAt);
        game.requestReveal(roundId);
    }

    function _finalizeWithRandom(uint256 plaintext) internal returns (uint256) {
        uint256 roundId = plaintext + 10;
        bytes32 handle = bytes32(uint256(0xA0000) + plaintext);
        incoMock.configure(INCO_FEE, handle);

        // Open far enough ahead that each formula case has its own epoch.
        uint64 openAt = EPOCH_ORIGIN + uint64(roundId * 60);
        vm.warp(openAt);
        // Force currentRoundId == roundId by warping into that epoch.
        game.openRound{value: INCO_FEE}(roundId);
        vm.warp(openAt + 45);
        game.requestReveal(roundId);
        game.finalizeRound(roundId, plaintext, _signatures());
        return game.getRound(roundId).crashPointBps;
    }

    function _signatures() internal pure returns (bytes[] memory signatures) {
        signatures = new bytes[](1);
        signatures[0] = hex"01";
    }
}
