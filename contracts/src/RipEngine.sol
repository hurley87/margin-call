// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {AssetRegistry} from "./AssetRegistry.sol";
import {PackCustody} from "./PackCustody.sol";
import {IRandomnessSource} from "./interfaces/IRandomnessSource.sol";
import {RipMath} from "./libraries/RipMath.sol";

/// @title RipEngine
/// @notice NAV-weighted Pack selection, live Rip pricing, Model-A settlement, Acquisition Fees.
/// @dev Pool membership is explicit (`enterPool` / `exitPool`) — PackCustody has no enumeration.
///      Crown carve-out is a documented seam for #302; V1 leaves `crownShareOfSurcharge` unused.
contract RipEngine is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant WAD = 1e18;

    PackCustody public immutable packs;
    AssetRegistry public immutable registry;
    IERC20 public immutable stablecoin;
    uint8 public immutable stableDecimals;

    IRandomnessSource public randomness;

    /// @notice Maker recorded at enrollment (custody clears `creatorOf` on burn).
    mapping(uint256 tokenId => address maker) public makerOf;

    /// @notice True while the Pack is in the resting set.
    mapping(uint256 tokenId => bool resting) public isResting;

    /// @dev Dense resting set for O(1) swap-and-pop removal.
    uint256[] private _resting;
    mapping(uint256 tokenId => uint256 indexPlusOne) private _restingIndex;

    /// @notice Cumulative Acquisition Fee per resting Pack (stablecoin units).
    uint256 public accFeePerPack;

    /// @notice Integer remainder of fee socialization not yet distributed.
    uint256 public feeDust;

    /// @notice Fee-index checkpoint at enrollment (or last crystallize).
    mapping(uint256 tokenId => uint256 checkpoint) public feeCheckpoint;

    /// @notice Crystallized Acquisition Fee balances (stablecoin units), keyed by Maker.
    mapping(address maker => uint256 amount) public claimableFees;

    /// @notice Protocol cut accrued (stablecoin units), withdrawable by admin.
    uint256 public protocolAccrued;

    event PackEntered(uint256 indexed tokenId, address indexed maker);
    event PackExited(uint256 indexed tokenId, address indexed maker);
    event PackRipped(
        uint256 indexed tokenId,
        address indexed taker,
        address indexed maker,
        uint256 nav,
        uint256 unitPrice,
        uint256 protocolCut,
        uint256 toMakers
    );
    event RipSettled(
        address indexed taker,
        uint256 count,
        uint256 unitPrice,
        uint256 totalPaid,
        uint256 protocolCut,
        uint256 toMakers
    );
    event FeesClaimed(address indexed maker, uint256 amount);
    event ProtocolFeesWithdrawn(address indexed to, uint256 amount);
    event RandomnessUpdated(address indexed randomness);

    error ZeroAddress();
    error NotPackCreator(uint256 tokenId, address caller);
    error PackNotListed(uint256 tokenId);
    error PackAlreadyResting(uint256 tokenId);
    error PackNotResting(uint256 tokenId);
    error PackStillListed(uint256 tokenId);
    error EmptyEligibleSet();
    error DegenerateEligibleSet(uint256 eligible, uint256 count);
    error CountOutOfRange(uint256 count, uint256 maxBatchSize);
    error SlippageExceeded(uint256 totalPaid, uint256 maxTotalPayment);
    error NothingToClaim();
    error ZeroAmount();

    /// @param admin DEFAULT_ADMIN_ROLE holder.
    /// @param packs_ PackCustody (must later grant this contract `RIP_ENGINE_ROLE`).
    /// @param registry_ AssetRegistry for NAV / levers.
    /// @param stablecoin_ Payment token (MockUSD on testnet); peg trusted at par.
    /// @param randomness_ Injectable entropy source.
    constructor(address admin, address packs_, address registry_, address stablecoin_, address randomness_) {
        if (
            admin == address(0) || packs_ == address(0) || registry_ == address(0) || stablecoin_ == address(0)
                || randomness_ == address(0)
        ) {
            revert ZeroAddress();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        packs = PackCustody(packs_);
        registry = AssetRegistry(registry_);
        stablecoin = IERC20(stablecoin_);
        stableDecimals = IERC20Metadata(stablecoin_).decimals();
        randomness = IRandomnessSource(randomness_);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pool enrollment
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Enroll a listed Pack into the resting set. Maker-only.
    /// @dev Snapshots `makerOf` and the fee checkpoint. Does not require NAV eligibility —
    ///      undrawable Packs still accrue the equal-rate Acquisition Fee while enrolled.
    function enterPool(uint256 tokenId) external nonReentrant {
        if (!packs.isListed(tokenId)) revert PackNotListed(tokenId);
        address creator = packs.creatorOf(tokenId);
        if (msg.sender != creator) revert NotPackCreator(tokenId, msg.sender);
        if (isResting[tokenId]) revert PackAlreadyResting(tokenId);

        makerOf[tokenId] = creator;
        feeCheckpoint[tokenId] = accFeePerPack;
        _addResting(tokenId);

        emit PackEntered(tokenId, creator);
    }

    /// @notice Remove a Pack from the resting set.
    /// @dev Maker may exit while listed. Anyone may exit once the Pack is no longer listed
    ///      (ripped / transferred / redeemed) so the set cannot retain ghosts.
    function exitPool(uint256 tokenId) external nonReentrant {
        if (!isResting[tokenId]) revert PackNotResting(tokenId);

        address maker = makerOf[tokenId];
        bool listed = packs.isListed(tokenId);
        if (listed) {
            if (msg.sender != maker) revert NotPackCreator(tokenId, msg.sender);
        }

        _crystallize(tokenId);
        _removeResting(tokenId);
        // Keep makerOf so a later claimFees on a still-listed exit path retains identity;
        // cleared only when we want — leave for claim path. Actually after exit while listed,
        // maker may re-enter. Clear makerOf only if not listed? If listed and maker exits,
        // they can re-enter which overwrites makerOf. If unlisted, makerOf stays for claims.
        if (listed) {
            delete makerOf[tokenId];
            delete feeCheckpoint[tokenId];
        }

        emit PackExited(tokenId, maker);
    }

    /// @notice Resting Pack ids (enrollment order; gaps closed on removal).
    function restingPackIds() external view returns (uint256[] memory) {
        return _resting;
    }

    /// @notice Number of Packs currently enrolled.
    function restingCount() external view returns (uint256) {
        return _resting.length;
    }

    /// @notice Eligible Packs and their NAVs at the current block (fail-closed per Pack).
    /// @dev A Pack drops out when not listed, navOf reverts (frozen/stale/invalid), or out of band.
    function eligibleSnapshot()
        public
        view
        returns (uint256[] memory tokenIds, uint256[] memory navs, uint256 eligibleCount)
    {
        uint256 n = _resting.length;
        uint256[] memory idsBuf = new uint256[](n);
        uint256[] memory navBuf = new uint256[](n);
        uint256 count;

        for (uint256 i; i < n; ++i) {
            uint256 tokenId = _resting[i];
            if (!packs.isListed(tokenId)) continue;

            (bool ok, uint256 nav) = _tryNav(tokenId);
            if (!ok) continue;
            if (!registry.isNavInBand(nav)) continue;

            idsBuf[count] = tokenId;
            navBuf[count] = nav;
            unchecked {
                ++count;
            }
        }

        tokenIds = new uint256[](count);
        navs = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            tokenIds[i] = idsBuf[i];
            navs[i] = navBuf[i];
        }
        eligibleCount = count;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Live pricing
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Quote a batch Rip off a single eligible snapshot.
    /// @return eligible Number of Packs in the price/selection set.
    /// @return hm Harmonic mean of eligible NAVs (WAD USD).
    /// @return unitPrice Clamped per-Pack Rip price (WAD USD).
    /// @return totalPayment Total stablecoin units the Taker would pay (`count * unitStable`).
    function quoteRip(uint256 count)
        public
        view
        returns (uint256 eligible, uint256 hm, uint256 unitPrice, uint256 totalPayment)
    {
        if (count == 0 || count > registry.maxBatchSize()) {
            revert CountOutOfRange(count, registry.maxBatchSize());
        }

        (, uint256[] memory navs, uint256 eligibleCount) = eligibleSnapshot();
        if (eligibleCount == 0) revert EmptyEligibleSet();
        if (eligibleCount <= count) revert DegenerateEligibleSet(eligibleCount, count);

        hm = RipMath.harmonicMean(navs);
        unitPrice = RipMath.clampUnitPrice(hm, registry.surcharge(), registry.minPackNav(), registry.poolMax());
        totalPayment = _wadToStable(unitPrice) * count;
        eligible = eligibleCount;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Rip — Model A settlement
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Per-unit and batch totals in stablecoin units (plus WAD unit price for events).
    struct RipQuote {
        uint256 unitPriceWad;
        uint256 unitStable;
        uint256 totalPaid;
        uint256 protocolCutUnit;
        uint256 toMakersUnit;
        uint256 protocolCutTotal;
        uint256 toMakersTotal;
    }

    /// @notice Rip `count` distinct Packs. Priced off one snapshot; settles Model A.
    /// @param count Packs to draw (1..maxBatchSize); requires eligibleCount > count.
    /// @param maxTotalPayment Slippage bound in stablecoin units (live pricing).
    /// @return tokenIds Drawn Pack ids, now held by the Taker.
    function rip(uint256 count, uint256 maxTotalPayment) external nonReentrant returns (uint256[] memory tokenIds) {
        if (count == 0 || count > registry.maxBatchSize()) {
            revert CountOutOfRange(count, registry.maxBatchSize());
        }

        (uint256[] memory eligibleIds, uint256[] memory navs, uint256 eligibleCount) = eligibleSnapshot();
        if (eligibleCount == 0) revert EmptyEligibleSet();
        if (eligibleCount <= count) revert DegenerateEligibleSet(eligibleCount, count);

        RipQuote memory q = _priceRip(navs, count);
        if (q.totalPaid > maxTotalPayment) revert SlippageExceeded(q.totalPaid, maxTotalPayment);

        stablecoin.safeTransferFrom(msg.sender, address(this), q.totalPaid);
        protocolAccrued += q.protocolCutTotal;

        tokenIds = _settleDraws(eligibleIds, navs, count, q);

        // Socialize to_makers equally across Packs still enrolled.
        // Guaranteed remaining > 0 by eligibleCount > count (see DegenerateEligibleSet).
        uint256 distributable = q.toMakersTotal + feeDust;
        uint256 perPack = distributable / _resting.length;
        feeDust = distributable % _resting.length;
        if (perPack > 0) {
            accFeePerPack += perPack;
        }

        emit RipSettled(msg.sender, count, q.unitPriceWad, q.totalPaid, q.protocolCutTotal, q.toMakersTotal);
    }

    function _priceRip(uint256[] memory navs, uint256 count) internal view returns (RipQuote memory q) {
        uint256 surcharge = registry.surcharge();
        q.unitPriceWad =
            RipMath.clampUnitPrice(RipMath.harmonicMean(navs), surcharge, registry.minPackNav(), registry.poolMax());
        q.unitStable = _wadToStable(q.unitPriceWad);
        q.totalPaid = q.unitStable * count;

        // Split from the paid unit so "base never cut" holds under band clamp.
        uint256 baseStable = (q.unitStable * WAD) / (WAD + surcharge);
        uint256 surStable = q.unitStable - baseStable;
        q.protocolCutUnit = (surStable * registry.protocolShareOfSurcharge()) / WAD;
        // Crown seam (#302): when enabled, carve crownShareOfSurcharge from surcharge here.
        q.toMakersUnit = q.unitStable - q.protocolCutUnit;
        q.protocolCutTotal = q.protocolCutUnit * count;
        q.toMakersTotal = q.toMakersUnit * count;
    }

    function _settleDraws(uint256[] memory eligibleIds, uint256[] memory navs, uint256 count, RipQuote memory q)
        internal
        returns (uint256[] memory tokenIds)
    {
        uint256[] memory weights = new uint256[](eligibleIds.length);
        {
            uint256 alpha = registry.alpha();
            for (uint256 i; i < eligibleIds.length; ++i) {
                weights[i] = RipMath.weightOf(navs[i], alpha);
            }
        }

        uint256[] memory drawnIdx;
        {
            uint256 seed =
                randomness.nextSeed(keccak256(abi.encode(count, eligibleIds.length, _resting.length, msg.sender)));
            drawnIdx = RipMath.drawDistinct(weights, seed, count);
        }

        tokenIds = new uint256[](count);
        for (uint256 k; k < count; ++k) {
            uint256 idx = drawnIdx[k];
            tokenIds[k] = eligibleIds[idx];
            _finalizeDrawnPack(eligibleIds[idx], msg.sender, navs[idx], q);
        }
    }

    function _finalizeDrawnPack(uint256 tokenId, address taker, uint256 nav, RipQuote memory q) internal {
        address maker = makerOf[tokenId];
        _crystallize(tokenId);
        _removeResting(tokenId);
        delete feeCheckpoint[tokenId];
        packs.releaseToRecipient(tokenId, taker);
        emit PackRipped(tokenId, taker, maker, nav, q.unitPriceWad, q.protocolCutUnit, q.toMakersUnit);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Acquisition Fee claims + protocol withdrawal
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Pending Acquisition Fee for a resting Pack (stablecoin units), including uncrystallized.
    function pendingOf(uint256 tokenId) public view returns (uint256) {
        if (!isResting[tokenId]) return 0;
        return accFeePerPack - feeCheckpoint[tokenId];
    }

    /// @notice Crystallize fees for the given resting Packs into `claimableFees[maker]` and withdraw all.
    function claimFees(uint256[] calldata tokenIds) external nonReentrant returns (uint256 amount) {
        for (uint256 i; i < tokenIds.length; ++i) {
            uint256 tokenId = tokenIds[i];
            if (!isResting[tokenId]) continue;
            if (makerOf[tokenId] != msg.sender) continue;
            _crystallize(tokenId);
        }
        amount = claimableFees[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimableFees[msg.sender] = 0;
        stablecoin.safeTransfer(msg.sender, amount);
        emit FeesClaimed(msg.sender, amount);
    }

    /// @notice Withdraw already-crystallized Acquisition Fees (no Pack ids needed).
    function claim() external nonReentrant returns (uint256 amount) {
        amount = claimableFees[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimableFees[msg.sender] = 0;
        stablecoin.safeTransfer(msg.sender, amount);
        emit FeesClaimed(msg.sender, amount);
    }

    /// @notice Admin withdraws accrued protocol cut.
    function withdrawProtocolFees(address to) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 amount) {
        if (to == address(0)) revert ZeroAddress();
        amount = protocolAccrued;
        if (amount == 0) revert ZeroAmount();
        protocolAccrued = 0;
        stablecoin.safeTransfer(to, amount);
        emit ProtocolFeesWithdrawn(to, amount);
    }

    /// @notice Swap the randomness source (prospective).
    function setRandomness(address randomness_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (randomness_ == address(0)) revert ZeroAddress();
        randomness = IRandomnessSource(randomness_);
        emit RandomnessUpdated(randomness_);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────────────────

    function _addResting(uint256 tokenId) internal {
        isResting[tokenId] = true;
        _resting.push(tokenId);
        _restingIndex[tokenId] = _resting.length; // 1-based
    }

    function _removeResting(uint256 tokenId) internal {
        uint256 indexPlusOne = _restingIndex[tokenId];
        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = _resting.length - 1;

        if (index != lastIndex) {
            uint256 moved = _resting[lastIndex];
            _resting[index] = moved;
            _restingIndex[moved] = indexPlusOne;
        }

        _resting.pop();
        delete _restingIndex[tokenId];
        isResting[tokenId] = false;
    }

    /// @dev Credit uncrystallized fee to the Maker and bump the checkpoint.
    function _crystallize(uint256 tokenId) internal {
        uint256 pending = accFeePerPack - feeCheckpoint[tokenId];
        if (pending > 0) {
            claimableFees[makerOf[tokenId]] += pending;
            feeCheckpoint[tokenId] = accFeePerPack;
        }
    }

    function _tryNav(uint256 tokenId) internal view returns (bool ok, uint256 nav) {
        PackCustody.BasketEntry[] memory basket = packs.basketOf(tokenId);
        uint256 length = basket.length;
        if (length == 0) return (false, 0);

        address[] memory tokens = new address[](length);
        uint256[] memory amounts = new uint256[](length);
        for (uint256 i; i < length; ++i) {
            tokens[i] = basket[i].asset;
            amounts[i] = basket[i].amount;
        }

        try registry.navOf(tokens, amounts) returns (uint256 value) {
            return (true, value);
        } catch {
            return (false, 0);
        }
    }

    /// @dev Convert WAD USD to stablecoin units (peg trusted at par).
    function _wadToStable(uint256 wad) internal view returns (uint256) {
        return (wad * (10 ** uint256(stableDecimals))) / WAD;
    }
}
