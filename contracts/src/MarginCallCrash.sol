// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {e, inco} from "@inco/lightning/src/Lib.sol";
import {ETypes, euint256} from "@inco/lightning/src/Types.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IBankrollVault} from "./interfaces/IBankrollVault.sol";
import {LeverageTiers} from "./libraries/LeverageTiers.sol";

/// @notice Shared-round Crash game state on a fixed epoch grid.
/// @dev Owns pre-committed randomness, entry/reservation coordination, reveal, and expiry.
contract MarginCallCrash is ReentrancyGuard {
    uint64 public immutable epochOrigin;
    uint64 public immutable roundDuration;
    uint64 public immutable entryWindow;
    uint64 public immutable expiryDelay;
    IBankrollVault public immutable vault;

    uint256 internal constant CRASH_RANDOM_UPPER_BOUND = 10_000;
    uint256 internal constant CRASH_POINT_NUMERATOR = 99_000_000;
    uint256 internal constant MAX_CRASH_POINT_BPS = 100_000;
    uint256 internal constant LEVERAGE_SCALE = 10_000;
    uint256 internal constant ONE_TUSD = 1_000_000;

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

    struct Ticket {
        uint256 id;
        address player;
        uint256 roundId;
        uint256 margin;
        uint256 leverageBps;
        uint256 reservedPayout;
        bool settled;
        bool claimed;
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
    error ZeroVault();
    error InvalidMargin(uint256 margin);
    error InvalidLeverageTier(uint256 leverageBps);
    error EntryClosed(uint256 roundId, uint64 lockAt, uint256 currentTimestamp);
    error TicketAlreadyExists(uint256 roundId, address player);
    error TicketNotFound(uint256 ticketId);
    error TicketAlreadySettled(uint256 ticketId);
    error TicketDidNotWin(uint256 ticketId);
    error TicketDidNotLose(uint256 ticketId);
    error UnauthorizedClaimReceiver(address caller, address receiver);

    event RoundOpened(
        uint256 indexed roundId,
        address indexed opener,
        bytes32 crashRandom,
        uint64 openAt,
        uint64 lockAt,
        uint64 expiresAt
    );
    event TicketEntered(
        uint256 indexed roundId,
        uint256 indexed ticketId,
        address indexed player,
        uint256 margin,
        uint256 leverageBps,
        uint256 reservedPayout
    );
    event RevealRequested(uint256 indexed roundId, bytes32 crashRandom);
    event RoundFinalized(uint256 indexed roundId, bytes32 crashRandom, uint256 crashPointBps);
    event RoundExpired(uint256 indexed roundId);
    event TicketClaimed(
        uint256 indexed roundId, uint256 indexed ticketId, address indexed player, address receiver, uint256 payout
    );
    event TicketLossSettled(uint256 indexed roundId, uint256 indexed ticketId, address indexed player);

    mapping(uint256 roundId => Round round) private _rounds;
    mapping(uint256 ticketId => Ticket ticket) private _tickets;
    mapping(uint256 roundId => mapping(address player => uint256 ticketId)) private _ticketIdByRoundAndPlayer;
    uint256 public nextTicketId = 1;

    constructor(uint64 epochOrigin_, IBankrollVault vault_) {
        if (address(vault_) == address(0)) revert ZeroVault();

        epochOrigin = epochOrigin_;
        vault = vault_;
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

    /// @notice Returns a stored ticket, or an empty ticket when none exists.
    function getTicket(uint256 ticketId) external view returns (Ticket memory) {
        return _tickets[ticketId];
    }

    /// @notice Returns the ticket id for a wallet in a round, or zero when none exists.
    function getTicketId(uint256 roundId, address player) external view returns (uint256) {
        return _ticketIdByRoundAndPlayer[roundId][player];
    }

    /// @notice Permissionlessly materializes the current or next epoch.
    function openRound(uint256 roundId) external payable nonReentrant {
        _initializeRound(roundId, msg.sender, msg.value);
    }

    /// @notice Validates entry and atomically coordinates direct-to-vault margin plus reservation.
    /// @dev Lazy-creates an uninitialized current/next round when `msg.value` covers the Inco fee.
    ///      A fee-bearing call that loses the creation race refunds the entire `msg.value` and proceeds.
    function enter(uint256 roundId, uint256 margin, uint256 leverageBps) external payable nonReentrant {
        if (!_isSupportedMargin(margin)) revert InvalidMargin(margin);
        if (!LeverageTiers.isSupported(leverageBps)) revert InvalidLeverageTier(leverageBps);

        Round storage round = _rounds[roundId];
        if (round.status == RoundStatus.Uninitialized) {
            _initializeRound(roundId, msg.sender, msg.value);
        } else if (msg.value > 0) {
            (bool wasRefunded,) = payable(msg.sender).call{value: msg.value}("");
            if (!wasRefunded) revert EthRefundFailed(msg.sender, msg.value);
        }

        if (round.status != RoundStatus.Open) revert InvalidRoundStatus(roundId, round.status);
        if (block.timestamp >= round.lockAt) {
            revert EntryClosed(roundId, round.lockAt, block.timestamp);
        }
        if (_ticketIdByRoundAndPlayer[roundId][msg.sender] != 0) {
            revert TicketAlreadyExists(roundId, msg.sender);
        }

        uint256 maximumPayout = (margin * leverageBps) / LEVERAGE_SCALE;
        uint256 ticketId = nextTicketId++;

        vault.acceptEntry(roundId, ticketId, msg.sender, margin, leverageBps, maximumPayout);

        _tickets[ticketId] = Ticket({
            id: ticketId,
            player: msg.sender,
            roundId: roundId,
            margin: margin,
            leverageBps: leverageBps,
            reservedPayout: maximumPayout,
            settled: false,
            claimed: false
        });
        _ticketIdByRoundAndPlayer[roundId][msg.sender] = ticketId;
        round.totalMargin += margin;
        round.reservedPayout += maximumPayout;

        emit TicketEntered(roundId, ticketId, msg.sender, margin, leverageBps, maximumPayout);
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
    /// @dev Marks the vault to market in O(tiers) before any claim. Callers cannot substitute the handle.
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
        vault.markRoundFinalized(roundId, round.totalMargin, crashPointBps);
        emit RoundFinalized(roundId, round.crashRandom, crashPointBps);
    }

    /// @notice Permissionlessly pays a winning ticket. Third parties may only route to the owner.
    /// @dev The owner may pass `receiver = address(0)` for themselves, or any non-zero address.
    function claim(uint256 ticketId, address receiver) external nonReentrant {
        Ticket storage ticket = _tickets[ticketId];
        if (ticket.player == address(0)) revert TicketNotFound(ticketId);
        if (ticket.settled) revert TicketAlreadySettled(ticketId);

        Round storage round = _rounds[ticket.roundId];
        if (round.status != RoundStatus.Finalized) revert InvalidRoundStatus(ticket.roundId, round.status);
        if (ticket.leverageBps > round.crashPointBps) revert TicketDidNotWin(ticketId);

        address payoutReceiver = _resolveClaimReceiver(ticket.player, receiver);
        uint256 payout = (ticket.margin * ticket.leverageBps) / LEVERAGE_SCALE;

        ticket.settled = true;
        ticket.claimed = true;
        vault.payClaim(ticket.roundId, ticketId, payoutReceiver, payout);
        emit TicketClaimed(ticket.roundId, ticketId, ticket.player, payoutReceiver, payout);
    }

    /// @notice Permissionlessly settles a losing ticket without transferring tUSD.
    function settleLoss(uint256 ticketId) external nonReentrant {
        Ticket storage ticket = _tickets[ticketId];
        if (ticket.player == address(0)) revert TicketNotFound(ticketId);
        if (ticket.settled) revert TicketAlreadySettled(ticketId);

        Round storage round = _rounds[ticket.roundId];
        if (round.status != RoundStatus.Finalized) revert InvalidRoundStatus(ticket.roundId, round.status);
        if (ticket.leverageBps <= round.crashPointBps) revert TicketDidNotLose(ticketId);

        ticket.settled = true;
        vault.settleLoss(ticket.roundId, ticketId);
        emit TicketLossSettled(ticket.roundId, ticketId, ticket.player);
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

    function _resolveClaimReceiver(address owner, address receiver) internal view returns (address) {
        if (msg.sender == owner) {
            return receiver == address(0) ? owner : receiver;
        }
        if (receiver != address(0) && receiver != owner) {
            revert UnauthorizedClaimReceiver(msg.sender, receiver);
        }
        return owner;
    }

    /// @dev Shared initialization seam for openRound and lazy first-entry creation.
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

    function _isSupportedMargin(uint256 margin) internal pure returns (bool) {
        return margin == ONE_TUSD || margin == 5 * ONE_TUSD || margin == 10 * ONE_TUSD;
    }
}
