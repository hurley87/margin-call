// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Distributor
/// @notice Pays Maker Emissions and Participation Rewards from a funded GameToken balance.
/// @dev Funded purely by transferring GameToken in — there is no mint path anywhere, so the held
///      balance is the hard cap on payouts by construction.
///
///      Maker Emissions accrue continuously, equal per resting Pack, at `makerRatePerEpoch`
///      tokens per Pack per `EPOCH_DURATION`. RipEngine checkpoints accrual on enter / exit / Rip;
///      Makers claim at any time.
///
///      Participation Rewards are a fixed daily pot (`takerPotPerEpoch`) split equally across
///      successfully ripped Packs in a closed epoch. A batch of `count` contributes `count` Rips.
///      Empty epochs create no liability; floor-division dust stays in the funded balance. Pot
///      changes apply from the next epoch (prospective).
///
///      Epochs are anchored to `epochZeroStart` (the deploy timestamp), *not* to UTC midnight.
contract Distributor is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Epoch length. One day, per the PRD emission schedule.
    uint256 public constant EPOCH_DURATION = 1 days;

    /// @notice Reward token paid out. Funded by transferring it in.
    IERC20 public immutable gameToken;

    /// @notice Timestamp at which epoch 0 began (deploy time).
    uint256 public immutable epochZeroStart;

    /// @notice Sole RipEngine allowed to mutate Pack / Rip accounting. Set exactly once.
    address public ripEngine;

    /// @notice Maker Emissions rate: tokens per resting Pack per epoch.
    uint256 public makerRatePerEpoch;

    /// @notice Participation Rewards pot that applies from the next epoch onward.
    uint256 public takerPotPerEpoch;

    /// @notice Pot frozen for the epoch currently being written (`activeTakerPotEpoch`).
    uint256 public activeTakerPot;

    /// @notice Epoch whose pot is `activeTakerPot`. Advanced lazily on first write past it.
    uint256 public activeTakerPotEpoch;

    /// @notice True once `_syncTakerPot` has initialized `activeTakerPot` for some epoch.
    bool private _takerPotInitialized;

    /// @notice Accumulated Maker Emissions per Pack (token units), advanced continuously.
    uint256 public accTokenPerPack;

    /// @notice Fractional remainder of Maker accrual not yet rolled into `accTokenPerPack`.
    uint256 public emissionRemainder;

    /// @notice Last timestamp incorporated into Maker accrual.
    uint256 public lastEmissionUpdate;

    /// @notice Maker recorded for a Pack while it is enrolled for emissions.
    mapping(uint256 tokenId => address maker) public emissionMakerOf;

    /// @notice Accrual checkpoint for an enrolled Pack (`accTokenPerPack` at join / last crystallize).
    mapping(uint256 tokenId => uint256 debt) public emissionDebtOf;

    /// @notice Crystallized Maker Emissions awaiting withdrawal, keyed by Maker.
    mapping(address maker => uint256 amount) public makerCredit;

    /// @notice Frozen pot for an epoch (set on first Rip that lands in that epoch).
    mapping(uint256 epoch => uint256 pot) public potOf;

    /// @notice Whether `potOf[epoch]` has been frozen by a Rip (distinguishes pot = 0 from unset).
    mapping(uint256 epoch => bool frozen) public potFrozen;

    /// @notice Successfully ripped Packs recorded in an epoch.
    mapping(uint256 epoch => uint256 count) public ripCountOf;

    /// @notice Successfully ripped Packs recorded for an account in an epoch.
    mapping(uint256 epoch => mapping(address account => uint256 count)) public accountRipCountOf;

    /// @notice Whether `account` has already claimed Taker rewards for `epoch`.
    mapping(uint256 epoch => mapping(address account => bool)) public hasClaimed;

    /// @notice Lifetime tokens paid out across Maker and Taker claims.
    uint256 public totalClaimed;

    event RipEngineSet(address indexed ripEngine);
    event MakerRatePerEpochSet(uint256 makerRatePerEpoch);
    event TakerPotPerEpochSet(uint256 takerPotPerEpoch);
    event PackEmissionEntered(uint256 indexed tokenId, address indexed maker);
    event PackEmissionExited(uint256 indexed tokenId, address indexed maker, uint256 accrued);
    event RipRecorded(uint256 indexed epoch, address indexed taker, uint256 count, uint256 epochRipCount);
    event MakerTokensClaimed(address indexed account, uint256 amount);
    event TakerTokensClaimed(address indexed account, uint256 indexed epoch, uint256 amount);
    event Swept(address indexed token, address indexed to, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error RipEngineAlreadySet();
    error OnlyRipEngine();
    error PackAlreadyEnrolled(uint256 tokenId);
    error EpochNotClosed(uint256 epoch, uint256 currentEpoch);
    error AlreadyClaimed(uint256 epoch, address account);
    error NothingToClaim();
    error InsufficientFunds(uint256 amount, uint256 available);
    error CannotSweepGameToken();
    error EmptyClaimBatch();

    /// @param admin DEFAULT_ADMIN_ROLE holder (rate setters, RipEngine binding).
    /// @param gameToken_ Reward token; must grant this contract `GameToken.DISTRIBUTOR_ROLE` to pay out.
    constructor(address admin, address gameToken_) {
        if (admin == address(0) || gameToken_ == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        gameToken = IERC20(gameToken_);
        epochZeroStart = block.timestamp;
        lastEmissionUpdate = block.timestamp;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Wiring
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Bind the sole RipEngine. One-shot; there is no unset.
    function setRipEngine(address ripEngine_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (ripEngine_ == address(0)) revert ZeroAddress();
        if (ripEngine != address(0)) revert RipEngineAlreadySet();
        ripEngine = ripEngine_;
        emit RipEngineSet(ripEngine_);
    }

    modifier onlyRipEngine() {
        if (msg.sender != ripEngine) revert OnlyRipEngine();
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Owner rate setters (evented, prospective)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Set Maker Emissions per Pack per epoch. Takes effect from the next second after accrual is checkpointed.
    function setMakerRatePerEpoch(uint256 newRate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _advanceMaker();
        makerRatePerEpoch = newRate;
        emit MakerRatePerEpochSet(newRate);
    }

    /// @notice Set the Participation Rewards pot. Applies to the current epoch only while it has
    ///         no Rips yet; once an epoch freezes its pot, further changes wait for the next epoch.
    function setTakerPotPerEpoch(uint256 newPot) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _syncTakerPot();
        takerPotPerEpoch = newPot;
        if (!potFrozen[activeTakerPotEpoch]) {
            activeTakerPot = newPot;
        }
        emit TakerPotPerEpochSet(newPot);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RipEngine callbacks
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Enroll a Pack for Maker Emissions. RipEngine-only.
    function onPackEntered(uint256 tokenId, address maker) external onlyRipEngine {
        if (maker == address(0)) revert ZeroAddress();
        if (emissionMakerOf[tokenId] != address(0)) revert PackAlreadyEnrolled(tokenId);

        _advanceMaker();
        emissionMakerOf[tokenId] = maker;
        emissionDebtOf[tokenId] = accTokenPerPack;
        emit PackEmissionEntered(tokenId, maker);
    }

    /// @notice Crystallize and drop a Pack from Maker Emissions. RipEngine-only.
    /// @dev Covers every departure: manual exit, purge, and draw-out. No-ops when the Pack was
    ///      never enrolled (e.g. Distributor wired after the Pack entered the pool) so exits stay
    ///      live; a real enrolled Pack that fails bookkeeping still reverts the whole departure.
    function onPackExited(uint256 tokenId) external onlyRipEngine {
        address maker = emissionMakerOf[tokenId];
        if (maker == address(0)) return;

        _advanceMaker();
        uint256 accrued = accTokenPerPack - emissionDebtOf[tokenId];
        if (accrued != 0) {
            makerCredit[maker] += accrued;
        }

        delete emissionMakerOf[tokenId];
        delete emissionDebtOf[tokenId];
        emit PackEmissionExited(tokenId, maker, accrued);
    }

    /// @notice Record a successful Rip batch for Participation Rewards. RipEngine-only.
    /// @param taker Account that receives the epoch share.
    /// @param count Packs ripped in the batch (`>= 1`).
    function onRip(address taker, uint256 count) external onlyRipEngine {
        if (taker == address(0)) revert ZeroAddress();
        if (count == 0) revert ZeroAmount();

        _syncTakerPot();
        uint256 epoch = currentEpoch();
        if (!potFrozen[epoch]) {
            potOf[epoch] = activeTakerPot;
            potFrozen[epoch] = true;
        }

        ripCountOf[epoch] += count;
        accountRipCountOf[epoch][taker] += count;
        emit RipRecorded(epoch, taker, count, ripCountOf[epoch]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Claims
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Crystallize optional Pack ids, then withdraw all Maker credit for `account`.
    /// @dev Anyone may submit; funds go to `account`. Underfunding reverts without consuming credit.
    /// @param tokenIds Resting Packs to crystallize first; empty withdraws already-crystallized only.
    function claimMaker(address account, uint256[] calldata tokenIds) external nonReentrant returns (uint256 amount) {
        if (account == address(0)) revert ZeroAddress();

        _advanceMaker();
        for (uint256 i; i < tokenIds.length; ++i) {
            uint256 tokenId = tokenIds[i];
            if (emissionMakerOf[tokenId] != account) continue;
            uint256 pending = accTokenPerPack - emissionDebtOf[tokenId];
            if (pending == 0) continue;
            emissionDebtOf[tokenId] = accTokenPerPack;
            makerCredit[account] += pending;
        }

        amount = makerCredit[account];
        if (amount == 0) revert NothingToClaim();
        makerCredit[account] = 0;
        _payout(account, amount);
        emit MakerTokensClaimed(account, amount);
    }

    /// @notice Claim Participation Rewards for one or more closed epochs.
    /// @dev Anyone may submit; funds go to `account`. Underfunding reverts without consuming claims.
    function claimTaker(address account, uint256[] calldata epochs) external nonReentrant returns (uint256 amount) {
        if (account == address(0)) revert ZeroAddress();
        uint256 length = epochs.length;
        if (length == 0) revert EmptyClaimBatch();

        uint256 current = currentEpoch();
        uint256 claimedEpochs;
        for (uint256 i; i < length; ++i) {
            uint256 epoch = epochs[i];
            if (epoch >= current) revert EpochNotClosed(epoch, current);
            if (hasClaimed[epoch][account]) revert AlreadyClaimed(epoch, account);

            uint256 mine = accountRipCountOf[epoch][account];
            if (mine == 0) continue;

            hasClaimed[epoch][account] = true;
            unchecked {
                ++claimedEpochs;
            }

            uint256 share = (potOf[epoch] * mine) / ripCountOf[epoch];
            if (share == 0) continue;

            amount += share;
            emit TakerTokensClaimed(account, epoch, share);
        }

        if (claimedEpochs == 0) revert NothingToClaim();
        if (amount != 0) _payout(account, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Epoch index containing the current block, counted from `epochZeroStart`.
    function currentEpoch() public view returns (uint256) {
        return (block.timestamp - epochZeroStart) / EPOCH_DURATION;
    }

    /// @notice Timestamp at which `epoch` begins. Anchored to deploy time, not to UTC midnight.
    function epochStart(uint256 epoch) public view returns (uint256) {
        return epochZeroStart + epoch * EPOCH_DURATION;
    }

    /// @notice Tokens on hand — the hard cap on everything still unclaimed.
    function fundedBalance() public view returns (uint256) {
        return gameToken.balanceOf(address(this));
    }

    /// @notice Uncrystallized Maker Emissions for an enrolled Pack.
    function pendingMakerOf(uint256 tokenId) external view returns (uint256) {
        if (emissionMakerOf[tokenId] == address(0)) return 0;
        return _accTokenPerPackAt(block.timestamp) - emissionDebtOf[tokenId];
    }

    /// @notice Claimable Maker Emissions for `account`, including optional uncrystallized Packs.
    function claimableMakerOf(address account, uint256[] calldata tokenIds) external view returns (uint256 amount) {
        amount = makerCredit[account];
        uint256 acc = _accTokenPerPackAt(block.timestamp);
        for (uint256 i; i < tokenIds.length; ++i) {
            uint256 tokenId = tokenIds[i];
            if (emissionMakerOf[tokenId] != account) continue;
            amount += acc - emissionDebtOf[tokenId];
        }
    }

    /// @notice Claimable Participation Rewards for `account` in a closed epoch; 0 if open / already claimed / none.
    function claimableTakerOf(address account, uint256 epoch) external view returns (uint256) {
        if (epoch >= currentEpoch()) return 0;
        if (hasClaimed[epoch][account]) return 0;
        uint256 mine = accountRipCountOf[epoch][account];
        uint256 total = ripCountOf[epoch];
        if (mine == 0 || total == 0) return 0;
        return (potOf[epoch] * mine) / total;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin recovery
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Recover tokens sent here by mistake.
    /// @dev The GameToken is explicitly excluded: claimants rely on the funded balance.
    function sweep(address token, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (token == address(gameToken)) revert CannotSweepGameToken();
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        IERC20(token).safeTransfer(to, amount);
        emit Swept(token, to, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Roll Maker accrual forward to `block.timestamp`.
    function _advanceMaker() internal {
        uint256 now_ = block.timestamp;
        uint256 last = lastEmissionUpdate;
        if (now_ <= last) return;

        uint256 rate = makerRatePerEpoch;
        if (rate != 0) {
            uint256 scaled = (now_ - last) * rate + emissionRemainder;
            accTokenPerPack += scaled / EPOCH_DURATION;
            emissionRemainder = scaled % EPOCH_DURATION;
        }
        lastEmissionUpdate = now_;
    }

    /// @dev View counterpart of `_advanceMaker` without writing state.
    function _accTokenPerPackAt(uint256 timestamp) internal view returns (uint256) {
        uint256 last = lastEmissionUpdate;
        if (timestamp <= last) return accTokenPerPack;

        uint256 rate = makerRatePerEpoch;
        if (rate == 0) return accTokenPerPack;

        uint256 scaled = (timestamp - last) * rate + emissionRemainder;
        return accTokenPerPack + scaled / EPOCH_DURATION;
    }

    /// @dev Carry `takerPotPerEpoch` into the current epoch the first time we observe it.
    ///      Earlier epochs keep whatever pot they froze on their first Rip.
    function _syncTakerPot() internal {
        uint256 epoch = currentEpoch();
        if (!_takerPotInitialized) {
            activeTakerPot = takerPotPerEpoch;
            activeTakerPotEpoch = epoch;
            _takerPotInitialized = true;
            return;
        }
        if (epoch > activeTakerPotEpoch) {
            activeTakerPot = takerPotPerEpoch;
            activeTakerPotEpoch = epoch;
        }
    }

    /// @dev Pay from the held balance only — the balance, not a rate, is the hard cap.
    ///      State that authorizes the payout must already have been consumed by the caller so a
    ///      revert here leaves the entitlement claimable after a top-up.
    function _payout(address account, uint256 amount) internal {
        uint256 available = fundedBalance();
        if (amount > available) revert InsufficientFunds(amount, available);
        totalClaimed += amount;
        gameToken.safeTransfer(account, amount);
    }
}
