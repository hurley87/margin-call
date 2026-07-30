// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Distributor
/// @notice Pays Maker Emissions and Participation Rewards against per-epoch merkle Claim Roots.
/// @dev Funded purely by transferring GameToken in — there is no mint path anywhere, so the held
///      balance is the hard cap on payouts by construction. Entitlements are computed off-chain
///      from confirmed on-chain records and committed as one root per finished epoch; the published
///      rates below are the inputs to that computation, not an on-chain accrual.
///
///      Three independent bounds keep a bad root harmless: an account claims at most once per
///      epoch, an epoch pays out at most its declared `claimTotalOf`, and every payout is capped
///      by the live balance. A wrong root can therefore misallocate inside the funded balance but
///      can never inflate supply or overdraw the contract.
///
///      Canonical leaf (the only thing this contract fixes about tree construction):
///      `keccak256(bytes.concat(keccak256(abi.encode(epoch, account, makerAmount, takerAmount))))`
///      — see `leafOf`. Any merkle tree built with commutative sorted-pair keccak256 over those
///      leaves verifies here, including OpenZeppelin's `StandardMerkleTree` with the leaf encoding
///      `["uint256", "address", "uint256", "uint256"]`.
contract Distributor is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice WAD scale for share levers (`rebatePerRipCap`).
    uint256 public constant WAD = 1e18;

    /// @notice Epoch length. One day, per the PRD emission schedule.
    uint256 public constant EPOCH_DURATION = 1 days;

    /// @notice Reward token paid out. Funded by transferring it in.
    IERC20 public immutable gameToken;

    /// @notice Timestamp at which epoch 0 began (deploy time).
    uint256 public immutable epochZeroStart;

    /// @notice Maker Emissions rate: token per resting Pack per epoch. Published for off-chain use.
    uint256 public makerRatePerEpoch;

    /// @notice Participation Rewards pot: fixed token amount per epoch, split pro-rata by surcharge paid.
    uint256 public takerPotPerEpoch;

    /// @notice Per-Rip ceiling on the Participation Rewards pot, as a WAD share of `takerPotPerEpoch`.
    uint256 public rebatePerRipCap;

    /// @notice Claim Root committed for an epoch; zero until posted.
    mapping(uint256 epoch => bytes32 root) public claimRootOf;

    /// @notice Sum of all entitlements the posted root commits to, for an epoch.
    mapping(uint256 epoch => uint256 total) public claimTotalOf;

    /// @notice Amount actually claimed so far, for an epoch.
    mapping(uint256 epoch => uint256 claimed) public claimedTotalOf;

    /// @notice Number of accounts that have claimed, for an epoch. Freezes the root once non-zero.
    mapping(uint256 epoch => uint256 count) public claimCountOf;

    /// @notice Whether `account` has already claimed `epoch`.
    mapping(uint256 epoch => mapping(address account => bool)) public hasClaimed;

    /// @notice Lifetime tokens paid out across all epochs.
    uint256 public totalClaimed;

    /// @dev One epoch's entitlement for one account, plus its inclusion proof.
    struct ClaimInput {
        uint256 epoch;
        uint256 makerAmount;
        uint256 takerAmount;
        bytes32[] proof;
    }

    event MakerRatePerEpochSet(uint256 makerRatePerEpoch);
    event TakerPotPerEpochSet(uint256 takerPotPerEpoch);
    event RebatePerRipCapSet(uint256 rebatePerRipCap);
    event ClaimRootPosted(uint256 indexed epoch, bytes32 root, uint256 total);
    event ClaimRootReplaced(uint256 indexed epoch, bytes32 previousRoot, bytes32 root, uint256 total);
    event Claimed(
        uint256 indexed epoch, address indexed account, uint256 makerAmount, uint256 takerAmount, uint256 amount
    );
    event Swept(address indexed token, address indexed to, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error ZeroRoot();
    error RatioTooHigh(uint256 value);
    error EpochNotEnded(uint256 epoch, uint256 currentEpoch);
    error ClaimRootFrozen(uint256 epoch, uint256 claimCount);
    error ClaimRootNotPosted(uint256 epoch);
    error AlreadyClaimed(uint256 epoch, address account);
    error InvalidProof(uint256 epoch, address account);
    error EpochTotalExceeded(uint256 epoch, uint256 wouldBeClaimed, uint256 declaredTotal);
    error InsufficientFunds(uint256 amount, uint256 available);
    error CannotSweepGameToken();
    error EmptyClaimBatch();

    /// @param admin DEFAULT_ADMIN_ROLE holder (rate setters, Claim Root posting).
    /// @param gameToken_ Reward token; must grant this contract `GameToken.DISTRIBUTOR_ROLE` to pay out.
    constructor(address admin, address gameToken_) {
        if (admin == address(0) || gameToken_ == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        gameToken = IERC20(gameToken_);
        epochZeroStart = block.timestamp;

        // PRD launch default; rates start at zero and are set once a funding horizon is chosen.
        rebatePerRipCap = WAD / 10; // 0.10
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Owner rate setters (evented, prospective — inputs to the off-chain algorithm)
    // ─────────────────────────────────────────────────────────────────────────

    function setMakerRatePerEpoch(uint256 newRate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        makerRatePerEpoch = newRate;
        emit MakerRatePerEpochSet(newRate);
    }

    function setTakerPotPerEpoch(uint256 newPot) external onlyRole(DEFAULT_ADMIN_ROLE) {
        takerPotPerEpoch = newPot;
        emit TakerPotPerEpochSet(newPot);
    }

    function setRebatePerRipCap(uint256 newCap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newCap > WAD) revert RatioTooHigh(newCap);
        rebatePerRipCap = newCap;
        emit RebatePerRipCapSet(newCap);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Claim Roots
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Commit the entitlement root for a finished epoch.
    /// @dev Replaceable while nobody has claimed the epoch (so a mis-posted root is fixable), then
    ///      frozen for good. `total` is the sum the root commits to and doubles as the epoch's
    ///      payout ceiling — it is not checked against the balance here, because the Distributor
    ///      may be topped up between posting and claiming.
    /// @param epoch Epoch index; must already be over.
    /// @param root Merkle root over canonical leaves (see `leafOf`).
    /// @param total Sum of every entitlement the root commits to.
    function postClaimRoot(uint256 epoch, bytes32 root, uint256 total) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (root == bytes32(0)) revert ZeroRoot();
        if (total == 0) revert ZeroAmount();

        uint256 current = currentEpoch();
        if (epoch >= current) revert EpochNotEnded(epoch, current);

        uint256 claims = claimCountOf[epoch];
        if (claims != 0) revert ClaimRootFrozen(epoch, claims);

        bytes32 previousRoot = claimRootOf[epoch];
        claimRootOf[epoch] = root;
        claimTotalOf[epoch] = total;

        if (previousRoot == bytes32(0)) {
            emit ClaimRootPosted(epoch, root, total);
        } else {
            emit ClaimRootReplaced(epoch, previousRoot, root, total);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Claims
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Claim one epoch's entitlement for `account`. Anyone may submit; funds go to `account`.
    /// @return amount Tokens transferred (`makerAmount + takerAmount`).
    function claim(address account, ClaimInput calldata input) external nonReentrant returns (uint256 amount) {
        amount = _recordClaim(account, input);
        _payout(account, amount);
    }

    /// @notice Claim several epochs for `account` in one transaction and one transfer.
    /// @return amount Total tokens transferred across the batch.
    function claimBatch(address account, ClaimInput[] calldata inputs) external nonReentrant returns (uint256 amount) {
        uint256 length = inputs.length;
        if (length == 0) revert EmptyClaimBatch();

        for (uint256 i; i < length; ++i) {
            amount += _recordClaim(account, inputs[i]);
        }
        _payout(account, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Canonical claim leaf. Double-hashed so no leaf can collide with an internal node.
    function leafOf(uint256 epoch, address account, uint256 makerAmount, uint256 takerAmount)
        public
        pure
        returns (bytes32)
    {
        return keccak256(bytes.concat(keccak256(abi.encode(epoch, account, makerAmount, takerAmount))));
    }

    /// @notice Epoch index containing the current block.
    function currentEpoch() public view returns (uint256) {
        return (block.timestamp - epochZeroStart) / EPOCH_DURATION;
    }

    /// @notice Timestamp at which `epoch` begins.
    function epochStart(uint256 epoch) public view returns (uint256) {
        return epochZeroStart + epoch * EPOCH_DURATION;
    }

    /// @notice Tokens on hand — the hard cap on everything still unclaimed.
    function fundedBalance() public view returns (uint256) {
        return gameToken.balanceOf(address(this));
    }

    /// @notice Amount of `epoch` that the posted root still leaves unclaimed.
    function unclaimedOf(uint256 epoch) external view returns (uint256) {
        return claimTotalOf[epoch] - claimedTotalOf[epoch];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin recovery
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Recover tokens sent here by mistake.
    /// @dev The GameToken is explicitly excluded: claimants rely on the funded balance, and unspent
    ///      Participation Rewards roll forward rather than returning to the treasury.
    function sweep(address token, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(gameToken)) revert CannotSweepGameToken();
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        IERC20(token).safeTransfer(to, amount);
        emit Swept(token, to, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Verify and book one epoch's claim. All state is written before any transfer.
    function _recordClaim(address account, ClaimInput calldata input) internal returns (uint256 amount) {
        uint256 epoch = input.epoch;
        bytes32 root = claimRootOf[epoch];
        if (root == bytes32(0)) revert ClaimRootNotPosted(epoch);
        if (hasClaimed[epoch][account]) revert AlreadyClaimed(epoch, account);

        amount = input.makerAmount + input.takerAmount;
        if (amount == 0) revert ZeroAmount();

        bytes32 leaf = leafOf(epoch, account, input.makerAmount, input.takerAmount);
        if (!MerkleProof.verifyCalldata(input.proof, root, leaf)) revert InvalidProof(epoch, account);

        uint256 wouldBeClaimed = claimedTotalOf[epoch] + amount;
        uint256 declaredTotal = claimTotalOf[epoch];
        if (wouldBeClaimed > declaredTotal) revert EpochTotalExceeded(epoch, wouldBeClaimed, declaredTotal);

        hasClaimed[epoch][account] = true;
        claimedTotalOf[epoch] = wouldBeClaimed;
        claimCountOf[epoch] += 1;
        totalClaimed += amount;

        emit Claimed(epoch, account, input.makerAmount, input.takerAmount, amount);
    }

    /// @dev Pay from the held balance only — the balance, not a rate or a root, is the hard cap.
    function _payout(address account, uint256 amount) internal {
        uint256 available = fundedBalance();
        if (amount > available) revert InsufficientFunds(amount, available);
        gameToken.safeTransfer(account, amount);
    }
}
