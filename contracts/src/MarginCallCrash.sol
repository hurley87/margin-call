// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {inco} from "@inco/lightning/src/Lib.sol";
import {ETypes, euint256} from "@inco/lightning/src/Types.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Shared-round Crash game state on a fixed epoch grid.
/// @dev This slice initializes a round's confidential random value before tickets exist.
contract MarginCallCrash is ReentrancyGuard {
    uint64 public immutable epochOrigin;
    uint64 public immutable roundDuration;
    uint64 public immutable entryWindow;
    uint64 public immutable expiryDelay;

    uint256 internal constant CRASH_RANDOM_UPPER_BOUND = 10_000;

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

    event RoundOpened(
        uint256 indexed roundId,
        address indexed opener,
        bytes32 crashRandom,
        uint64 openAt,
        uint64 lockAt,
        uint64 expiresAt
    );

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
}
