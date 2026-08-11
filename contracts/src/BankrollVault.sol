// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {LeverageTiers} from "./libraries/LeverageTiers.sol";

/// @notice ERC-4626 LP share vault for Desk Dollars with game-only entry reservation.
/// @dev Share pricing uses net `totalAssets()`. Capacity and free-liquidity math use live `grossAssets`.
contract BankrollVault is ERC4626, ReentrancyGuard {
    using Math for uint256;
    using SafeERC20 for IERC20;

    uint256 internal constant SAFETY_BUFFER_NUMERATOR = 20;
    uint256 internal constant SAFETY_BUFFER_DENOMINATOR = 100;
    uint256 internal constant ROUND_RESERVATION_NUMERATOR = 25;
    uint256 internal constant ROUND_RESERVATION_DENOMINATOR = 100;
    uint256 internal constant TICKET_RESERVATION_NUMERATOR = 1;
    uint256 internal constant TICKET_RESERVATION_DENOMINATOR = 100;
    uint256 public constant MIN_GROSS_ASSETS_FOR_ENTRY = 10_000 * 10 ** 6;
    uint256 public constant MAX_TICKET_RESERVATION = 100 * 10 ** 6;

    /// @notice Total maximum payouts reserved for unresolved player tickets.
    uint256 public reservedLiabilities;

    /// @notice Payouts owed from finalized or expired tickets but not yet transferred.
    uint256 public pendingObligations;

    /// @notice Received player margin that has not yet been recognized as vault value.
    uint256 public unrecognizedMargin;

    /// @notice Deployer allowed to set the authorized game exactly once.
    address public immutable gameConfigurer;

    /// @notice Sole caller permitted to invoke game-only vault methods.
    address public authorizedGame;

    /// @dev A reservation exists iff `player` is non-zero; `acceptEntry` rejects a zero player.
    struct TicketReservation {
        uint256 roundId;
        address player;
        uint256 margin;
        uint256 maximumPayout;
        uint256 leverageBps;
    }

    mapping(uint256 ticketId => TicketReservation reservation) private _reservations;
    mapping(uint256 roundId => uint256 reservedPayout) public reservedPayoutByRound;
    mapping(uint256 roundId => mapping(uint256 leverageBps => uint256 reservedPayout)) public
        reservedPayoutByRoundAndTier;
    /// @dev Shared guard for finalize and expire: a round's obligations may be marked exactly once.
    mapping(uint256 roundId => bool marked) private _roundObligationsMarked;

    error UnauthorizedGameConfigurer(address caller);
    error AuthorizedGameAlreadySet();
    error ZeroAuthorizedGame();
    error UnauthorizedGameCaller(address caller);
    error ZeroPlayer();
    error ZeroRecipient();
    error InvalidMargin(uint256 margin);
    error InvalidMaximumPayout(uint256 margin, uint256 maximumPayout);
    error InvalidLeverageTier(uint256 leverageBps);
    error TicketReservationExists(uint256 ticketId);
    error TicketReservationMissing(uint256 ticketId);
    error TicketReservationMismatch(uint256 ticketId, uint256 roundId, address player);
    error PayoutExceedsReservation(uint256 payout, uint256 maximumPayout);
    error RefundMarginMismatch(uint256 provided, uint256 expected);
    error RoundAlreadyMarked(uint256 roundId);
    error UnrecognizedMarginUnderflow(uint256 unrecognizedMargin, uint256 totalMargin);
    error EntryFloorNotMet(uint256 grossAssets, uint256 required);
    error InsufficientFreeLiquidity(uint256 freeLiquidity, uint256 required);
    error RoundReservationExceeded(uint256 roundId, uint256 reservedPayout, uint256 limit);
    error TicketReservationExceeded(uint256 maximumPayout, uint256 limit);

    event AuthorizedGameChanged(address indexed previousGame, address indexed newGame);
    event LiabilityReserved(
        uint256 indexed roundId,
        uint256 indexed ticketId,
        address indexed player,
        uint256 margin,
        uint256 maximumPayout,
        uint256 leverageBps
    );
    event LiabilityReleased(
        uint256 indexed roundId,
        uint256 indexed ticketId,
        address indexed player,
        uint256 releasedReservation,
        uint256 paidAmount
    );

    constructor(IERC20 asset_) ERC20("Margin Call Bankroll Share", "mcLP") ERC4626(asset_) {
        gameConfigurer = msg.sender;
    }

    /// @notice Wires the authorized game address exactly once after deployment.
    function setAuthorizedGame(address game) external {
        if (msg.sender != gameConfigurer) revert UnauthorizedGameConfigurer(msg.sender);
        if (authorizedGame != address(0)) revert AuthorizedGameAlreadySet();
        if (game == address(0)) revert ZeroAuthorizedGame();

        authorizedGame = game;
        emit AuthorizedGameChanged(address(0), game);
    }

    /// @notice Returns the live Desk Dollars balance held by this vault before liability accounting.
    function grossAssets() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    /// @notice Returns net assets used by all standard ERC-4626 conversions and previews.
    function totalAssets() public view override returns (uint256) {
        return grossAssets() - pendingObligations - unrecognizedMargin;
    }

    /// @notice Returns net asset value per whole share, scaled by the vault's share decimals.
    /// @dev An empty vault deterministically returns one asset unit per share (10 ** decimals()).
    function assetsPerShare() external view returns (uint256) {
        uint256 supply = totalSupply();
        uint256 scale = 10 ** decimals();

        return supply == 0 ? scale : totalAssets().mulDiv(scale, supply);
    }

    /// @notice Returns the minimum gross-asset buffer that remains in the vault after LP withdrawals.
    /// @dev Rounds up so the buffer is never below 20% of gross assets.
    function safetyBuffer() public view returns (uint256) {
        return _safetyBuffer(grossAssets());
    }

    function _safetyBuffer(uint256 assets) internal pure returns (uint256) {
        return assets.mulDiv(SAFETY_BUFFER_NUMERATOR, SAFETY_BUFFER_DENOMINATOR, Math.Rounding.Ceil);
    }

    /// @notice Returns gross assets available for LP withdrawal after reservations and the safety buffer.
    /// @dev Reservations transitively cover pending obligations and unrecognized margin: a reservation is
    ///      consumed only when its payout or refund actually transfers, so `pendingObligations +
    ///      unrecognizedMargin` never exceeds `reservedLiabilities` (technical design §8).
    function freeLiquidity() public view returns (uint256) {
        uint256 assets = grossAssets();
        uint256 protectedAssets = reservedLiabilities + _safetyBuffer(assets);

        return assets > protectedAssets ? assets - protectedAssets : 0;
    }

    /// @notice Returns a stored ticket reservation, or an empty record when none exists.
    function getReservation(uint256 ticketId) external view returns (TicketReservation memory) {
        return _reservations[ticketId];
    }

    /// @notice Pulls player margin, enforces capacity limits, and records a ticket reservation.
    /// @dev Caller must be the authorized game. Share pricing is unchanged because margin is
    ///      added to both `grossAssets` and `unrecognizedMargin`.
    function acceptEntry(
        uint256 roundId,
        uint256 ticketId,
        address player,
        uint256 margin,
        uint256 leverageBps,
        uint256 maximumPayout
    ) external nonReentrant {
        _requireAuthorizedGameCaller();
        _validateEntryArgs(ticketId, player, margin, leverageBps, maximumPayout);

        IERC20(asset()).safeTransferFrom(player, address(this), margin);
        _enforceCapacityLimits(roundId, margin, maximumPayout);
        _storeReservation(roundId, ticketId, player, margin, leverageBps, maximumPayout);

        emit LiabilityReserved(roundId, ticketId, player, margin, maximumPayout, leverageBps);
    }

    /// @notice Marks a finalized round into share pricing before any claim is pulled.
    /// @dev Winning liability is the O(tiers) sum of reserved payouts at or below `crashPointBps`.
    function markRoundFinalized(uint256 roundId, uint256 totalMargin, uint256 crashPointBps) external nonReentrant {
        _requireAuthorizedGameCaller();
        if (_roundObligationsMarked[roundId]) revert RoundAlreadyMarked(roundId);
        if (totalMargin > unrecognizedMargin) {
            revert UnrecognizedMarginUnderflow(unrecognizedMargin, totalMargin);
        }

        uint256 winningLiability = _winningLiability(roundId, crashPointBps);
        _roundObligationsMarked[roundId] = true;
        unrecognizedMargin -= totalMargin;
        pendingObligations += winningLiability;
    }

    /// @notice Marks an expired round's margins into pending refund obligations.
    /// @dev Pricing-neutral: `totalAssets()` is unchanged because both unrecognizedMargin and
    ///      pendingObligations move by the same amount.
    function markRoundExpired(uint256 roundId, uint256 totalMargin) external nonReentrant {
        _requireAuthorizedGameCaller();
        if (_roundObligationsMarked[roundId]) revert RoundAlreadyMarked(roundId);
        if (totalMargin > unrecognizedMargin) {
            revert UnrecognizedMarginUnderflow(unrecognizedMargin, totalMargin);
        }

        _roundObligationsMarked[roundId] = true;
        unrecognizedMargin -= totalMargin;
        pendingObligations += totalMargin;
    }

    /// @notice Pays a winning ticket within its reservation and consumes the reservation.
    function payClaim(uint256 roundId, uint256 ticketId, address recipient, uint256 payout) external nonReentrant {
        _requireAuthorizedGameCaller();
        if (recipient == address(0)) revert ZeroRecipient();

        TicketReservation memory reservation = _consumeReservation(roundId, ticketId);
        if (payout > reservation.maximumPayout) {
            revert PayoutExceedsReservation(payout, reservation.maximumPayout);
        }

        // Marked winning liability funds every winning claim; checked
        // subtraction enforces the invariant.
        pendingObligations -= payout;
        emit LiabilityReleased(roundId, ticketId, reservation.player, reservation.maximumPayout, payout);
        IERC20(asset()).safeTransfer(recipient, payout);
    }

    /// @notice Releases a losing ticket reservation without transferring tUSD.
    function settleLoss(uint256 roundId, uint256 ticketId) external nonReentrant {
        _requireAuthorizedGameCaller();
        TicketReservation memory reservation = _consumeReservation(roundId, ticketId);
        emit LiabilityReleased(roundId, ticketId, reservation.player, reservation.maximumPayout, 0);
    }

    /// @notice Returns original margin for an expired ticket and consumes its reservation.
    /// @dev Requires `margin` to equal the stored reservation margin exactly.
    function refundMargin(uint256 roundId, uint256 ticketId, address recipient, uint256 margin) external nonReentrant {
        _requireAuthorizedGameCaller();
        if (recipient == address(0)) revert ZeroRecipient();

        TicketReservation memory reservation = _consumeReservation(roundId, ticketId);
        if (margin != reservation.margin) {
            revert RefundMarginMismatch(margin, reservation.margin);
        }

        pendingObligations -= margin;
        emit LiabilityReleased(roundId, ticketId, reservation.player, reservation.maximumPayout, margin);
        IERC20(asset()).safeTransfer(recipient, margin);
    }

    function _winningLiability(uint256 roundId, uint256 crashPointBps) internal view returns (uint256 liability) {
        uint256[6] memory tiers = LeverageTiers.all();
        for (uint256 i = 0; i < tiers.length; ++i) {
            if (tiers[i] <= crashPointBps) {
                liability += reservedPayoutByRoundAndTier[roundId][tiers[i]];
            }
        }
    }

    function _consumeReservation(uint256 roundId, uint256 ticketId)
        internal
        returns (TicketReservation memory reservation)
    {
        reservation = _reservations[ticketId];
        if (reservation.player == address(0)) revert TicketReservationMissing(ticketId);
        if (reservation.roundId != roundId) {
            revert TicketReservationMismatch(ticketId, roundId, reservation.player);
        }

        delete _reservations[ticketId];
        reservedLiabilities -= reservation.maximumPayout;
        reservedPayoutByRound[roundId] -= reservation.maximumPayout;
        reservedPayoutByRoundAndTier[roundId][reservation.leverageBps] -= reservation.maximumPayout;
    }

    function _requireAuthorizedGameCaller() internal view {
        if (msg.sender != authorizedGame) revert UnauthorizedGameCaller(msg.sender);
    }

    function _validateEntryArgs(
        uint256 ticketId,
        address player,
        uint256 margin,
        uint256 leverageBps,
        uint256 maximumPayout
    ) internal view {
        if (player == address(0)) revert ZeroPlayer();
        if (margin == 0) revert InvalidMargin(margin);
        if (maximumPayout < margin) revert InvalidMaximumPayout(margin, maximumPayout);
        if (!LeverageTiers.isSupported(leverageBps)) revert InvalidLeverageTier(leverageBps);
        if (_reservations[ticketId].player != address(0)) revert TicketReservationExists(ticketId);
    }

    function _enforceCapacityLimits(uint256 roundId, uint256 margin, uint256 maximumPayout) internal view {
        uint256 assetsAfterTransfer = grossAssets();
        if (assetsAfterTransfer < MIN_GROSS_ASSETS_FOR_ENTRY) {
            revert EntryFloorNotMet(assetsAfterTransfer, MIN_GROSS_ASSETS_FOR_ENTRY);
        }

        uint256 reservedAfterEntry = reservedLiabilities + maximumPayout;
        if (reservedAfterEntry + _safetyBuffer(assetsAfterTransfer) > assetsAfterTransfer) {
            // The margin transfer has already executed, so freeLiquidity() is the post-entry view.
            revert InsufficientFreeLiquidity(freeLiquidity(), maximumPayout - margin);
        }

        uint256 roundReservedAfterEntry = reservedPayoutByRound[roundId] + maximumPayout;
        uint256 roundLimit = assetsAfterTransfer.mulDiv(ROUND_RESERVATION_NUMERATOR, ROUND_RESERVATION_DENOMINATOR);
        if (roundReservedAfterEntry > roundLimit) {
            revert RoundReservationExceeded(roundId, roundReservedAfterEntry, roundLimit);
        }

        uint256 ticketLimit = Math.min(
            MAX_TICKET_RESERVATION,
            assetsAfterTransfer.mulDiv(TICKET_RESERVATION_NUMERATOR, TICKET_RESERVATION_DENOMINATOR)
        );
        if (maximumPayout > ticketLimit) {
            revert TicketReservationExceeded(maximumPayout, ticketLimit);
        }
    }

    function _storeReservation(
        uint256 roundId,
        uint256 ticketId,
        address player,
        uint256 margin,
        uint256 leverageBps,
        uint256 maximumPayout
    ) internal {
        _reservations[ticketId] = TicketReservation({
            roundId: roundId, player: player, margin: margin, maximumPayout: maximumPayout, leverageBps: leverageBps
        });
        reservedLiabilities += maximumPayout;
        unrecognizedMargin += margin;
        reservedPayoutByRound[roundId] += maximumPayout;
        reservedPayoutByRoundAndTier[roundId][leverageBps] += maximumPayout;
    }

    /// @notice Returns the owner's immediately executable asset withdrawal limit.
    function maxWithdraw(address owner) public view override returns (uint256) {
        (uint256 maxAssets,) = _withdrawalLimits(owner);
        return maxAssets;
    }

    /// @notice Returns the owner's immediately executable share redemption limit.
    function maxRedeem(address owner) public view override returns (uint256) {
        uint256 ownerShares = balanceOf(owner);
        (uint256 maxAssets, uint256 ownerAssets) = _withdrawalLimits(owner);

        if (maxAssets == ownerAssets) return ownerShares;

        uint256 maxShares = _convertToShares(maxAssets + 1, Math.Rounding.Ceil) - 1;
        return Math.min(ownerShares, maxShares);
    }

    function _withdrawalLimits(address owner) internal view returns (uint256 maxAssets, uint256 ownerAssets) {
        uint256 supply = totalSupply();
        if (supply == 0) return (0, 0);

        uint256 ownerShares = balanceOf(owner);
        ownerAssets = convertToAssets(ownerShares);
        maxAssets = Math.min(ownerAssets, freeLiquidity().mulDiv(ownerShares, supply));
    }
}
