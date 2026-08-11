// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {e, inco} from "@inco/lightning/src/Lib.sol";
import {ETypes, euint256} from "@inco/lightning/src/Types.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Shared-round Crash game state on a fixed epoch grid.
/// @dev This slice owns pre-committed randomness plus reveal, attested finalization, and expiry.
contract MarginCallCrash is ReentrancyGuard {
    uint64 public immutable epochOrigin;
    uint64 public immutable roundDuration;
    uint64 public immutable entryWindow;
    uint64 public immutable expiryDelay;

    uint256 internal constant CRASH_RANDOM_UPPER_BOUND = 10_000;
    uint256 internal constant CRASH_POINT_NUMERATOR = 99_000_000;
    uint256 internal constant MAX_CRASH_POINT_BPS = 100_000;

    enum RoundStatus {
        Uninitialized,
        Open,
        RevealRequested,
        Finalized,
        Expired
    }

    struct Round {
        uint256 id;
        uint64 openAt;
        uint64 lockAt;
        uint64 expiresAt;
        bytes32 crashRandom;
        uint256 crashPointBps;
        uint256 totalMargin;
        uint256 reservedPayout;
        RoundStatus status;
    }

    error EpochNotStarted(uint256 currentTimestamp, uint64 epochOrigin);
    error InvalidRoundId(uint256 requestedRoundId, uint256 currentRoundId);
    error RoundAlreadyInitialized(uint256 roundId);
    error InsufficientIncoFee(uint256 requiredFee, uint256 providedFee);
    error EthRefundFailed(address recipient, uint256 amount);
    error RoundTimestampOverflow(uint256 roundId);
    error InvalidIncoHandle();
    error RoundNotInitialized(uint256 roundId);
    error RevealBeforeLock(uint256 roundId, uint64 lockAt, uint256 currentTimestamp);
    error LifecycleAfterExpiry(uint256 roundId, uint64 expiresAt, uint256 currentTimestamp);
    error ExpireBeforeExpiry(uint256 roundId, uint64 expiresAt, uint256 currentTimestamp);
    error InvalidRoundStatus(uint256 roundId, RoundStatus status);
    error InvalidAttestation(uint256 roundId);
    error RandomOutOfRange(uint256 plaintext);

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

    mapping(uint256 roundId => Round round) private _rounds;

    constructor(uint64 epochOrigin_) {
        epochOrigin = epochOrigin_;
        roundDuration = 60;
        entryWindow = 45;
        expiryDelay = 15 minutes;
    }

    /// @notice Returns the zero-based round id for the current epoch.
    function currentRoundId() public view returns (uint256) {
        if (block.timestamp < epochOrigin) revert EpochNotStarted(block.timestamp, epochOrigin);
        return (block.timestamp - epochOrigin) / roundDuration;
    }

    /// @notice Returns stored state for a round; status is Uninitialized when no round exists.
    function getRound(uint256 roundId) external view returns (Round memory) {
        return _rounds[roundId];
    }

    /// @notice Returns deterministic timestamps for any representable round id.
    function roundTimes(uint256 roundId) external view returns (uint64 openAt, uint64 lockAt, uint64 expiresAt) {
        return _roundTimes(roundId);
    }

    /// @notice Permissionlessly materializes the current or next epoch.
    function openRound(uint256 roundId) external payable nonReentrant {
        _initializeRound(roundId, msg.sender, msg.value);
    }

    /// @notice Permissionlessly marks the round's stored handle for public reveal after lock.
    function requestReveal(uint256 roundId) external nonReentrant {
        Round storage round = _rounds[roundId];
        if (round.status == RoundStatus.Uninitialized) revert RoundNotInitialized(roundId);
        if (block.timestamp < round.lockAt) {
            revert RevealBeforeLock(roundId, round.lockAt, block.timestamp);
        }
        if (block.timestamp >= round.expiresAt) {
            revert LifecycleAfterExpiry(roundId, round.expiresAt, block.timestamp);
        }
        if (round.status == RoundStatus.RevealRequested) return;
        if (round.status != RoundStatus.Open) revert InvalidRoundStatus(roundId, round.status);

        e.reveal(euint256.wrap(round.crashRandom));
        round.status = RoundStatus.RevealRequested;
        emit RevealRequested(roundId, round.crashRandom);
    }

    /// @notice Permissionlessly finalizes a revealed round with a covalidator attestation.
    /// @dev The contract binds the attestation to the exact stored handle; callers cannot substitute one.
    function finalizeRound(uint256 roundId, uint256 plaintext, bytes[] calldata signatures) external nonReentrant {
        Round storage round = _rounds[roundId];
        if (round.status == RoundStatus.Uninitialized) revert RoundNotInitialized(roundId);
        if (block.timestamp >= round.expiresAt) {
            revert LifecycleAfterExpiry(roundId, round.expiresAt, block.timestamp);
        }
        if (round.status != RoundStatus.RevealRequested) revert InvalidRoundStatus(roundId, round.status);
        if (plaintext >= CRASH_RANDOM_UPPER_BOUND) revert RandomOutOfRange(plaintext);

        if (!e.verifyDecryption(euint256.wrap(round.crashRandom), plaintext, signatures)) {
            revert InvalidAttestation(roundId);
        }

        uint256 crashPointBps = _crashPointFromRandom(plaintext);
        round.crashPointBps = crashPointBps;
        round.status = RoundStatus.Finalized;
        emit RoundFinalized(roundId, round.crashRandom, crashPointBps);
    }

    /// @notice Permissionlessly marks an unresolved round expired once the exclusive boundary is reached.
    function expireRound(uint256 roundId) external nonReentrant {
        Round storage round = _rounds[roundId];
        if (round.status == RoundStatus.Uninitialized) revert RoundNotInitialized(roundId);
        if (block.timestamp < round.expiresAt) {
            revert ExpireBeforeExpiry(roundId, round.expiresAt, block.timestamp);
        }
        if (round.status != RoundStatus.Open && round.status != RoundStatus.RevealRequested) {
            revert InvalidRoundStatus(roundId, round.status);
        }

        round.status = RoundStatus.Expired;
        emit RoundExpired(roundId);
    }

    /// @dev Shared initialization seam for the future lazy first-entry path.
    function _initializeRound(uint256 roundId, address opener, uint256 suppliedValue) internal {
        uint256 activeRoundId = currentRoundId();
        if (roundId != activeRoundId && roundId != activeRoundId + 1) {
            revert InvalidRoundId(roundId, activeRoundId);
        }
        if (_rounds[roundId].status != RoundStatus.Uninitialized) revert RoundAlreadyInitialized(roundId);

        uint256 fee = inco.getFee();
        if (suppliedValue < fee) revert InsufficientIncoFee(fee, suppliedValue);

        (uint64 openAt, uint64 lockAt, uint64 expiresAt) = _roundTimes(roundId);
        euint256 upperBound = inco.asEuint256(CRASH_RANDOM_UPPER_BOUND);
        bytes32 crashRandom = inco.eRandBounded{value: fee}(euint256.unwrap(upperBound), ETypes.Uint256);
        if (crashRandom == bytes32(0)) revert InvalidIncoHandle();
        // Inco operation results grant only transaction-scoped access. Persist this
        // contract's permission so a later reveal transaction can use the handle.
        inco.allow(crashRandom, address(this));

        _rounds[roundId] = Round({
            id: roundId,
            openAt: openAt,
            lockAt: lockAt,
            expiresAt: expiresAt,
            crashRandom: crashRandom,
            crashPointBps: 0,
            totalMargin: 0,
            reservedPayout: 0,
            status: RoundStatus.Open
        });

        emit RoundOpened(roundId, opener, crashRandom, openAt, lockAt, expiresAt);

        uint256 refund = suppliedValue - fee;
        if (refund == 0) return;

        (bool wasRefunded,) = payable(opener).call{value: refund}("");
        if (!wasRefunded) revert EthRefundFailed(opener, refund);
    }

    function _roundTimes(uint256 roundId) internal view returns (uint64 openAt, uint64 lockAt, uint64 expiresAt) {
        uint256 computedOpenAt = uint256(epochOrigin) + roundId * roundDuration;
        if (computedOpenAt > type(uint64).max - entryWindow - expiryDelay) revert RoundTimestampOverflow(roundId);

        // The bound above reserves room for every later timestamp before narrowing.
        // forge-lint: disable-next-line(unsafe-typecast)
        openAt = uint64(computedOpenAt);
        lockAt = openAt + entryWindow;
        expiresAt = lockAt + expiryDelay;
    }

    /// @dev Crash Point derivation seam for later payout slices.
    function _crashPointFromRandom(uint256 randomValue) internal pure returns (uint256) {
        uint256 rawCrashBps = CRASH_POINT_NUMERATOR / (CRASH_RANDOM_UPPER_BOUND - randomValue);
        return rawCrashBps > MAX_CRASH_POINT_BPS ? MAX_CRASH_POINT_BPS : rawCrashBps;
    }
}
