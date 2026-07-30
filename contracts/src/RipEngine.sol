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
/// @notice NAV-weighted Pack selection, live Rip pricing, Model-A settlement, Acquisition Fees,
///         and the Crown carve-out.
/// @dev Pool membership is explicit (`enterPool` / `exitPool`) — PackCustody has no enumeration.
///      Unlisted Packs are purged before fee socialization so ghosts cannot dilute the rate.
///      Crown totals are checkpointed rather than live: a Pack's NAV joins its Maker's total at
///      enrollment and is re-read only by `syncPackNav`. Summing live NAV per Maker inside `rip`
///      would need an unbounded grouping pass over the resting set, so the Crown reads the
///      checkpoints and anyone may true one up. See `_challenge` for the king-of-the-hill rule.
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

    /// @dev Dense resting set for O(1) swap-and-pop removal. Membership ↔ `_restingIndex[id] != 0`.
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

    /// @notice Checkpointed USD NAV (WAD) of a resting Pack, as of enrollment or last sync.
    mapping(uint256 tokenId => uint256 nav) public navCheckpoint;

    /// @notice Sum of `navCheckpoint` across a Maker's resting Packs (WAD USD).
    mapping(address maker => uint256 nav) public restingNavOf;

    /// @notice Maker holding the Crown — the largest total resting NAV. Zero while vacant.
    address public crownedMaker;

    event PackEntered(uint256 indexed tokenId, address indexed maker);
    event PackExited(uint256 indexed tokenId, address indexed maker);
    event PackRipped(
        uint256 indexed tokenId,
        address indexed taker,
        address indexed maker,
        uint256 nav,
        uint256 unitPrice,
        uint256 protocolCut,
        uint256 crownCut,
        uint256 toMakers
    );
    event RipSettled(
        address indexed taker,
        uint256 count,
        uint256 unitPrice,
        uint256 totalPaid,
        uint256 protocolCut,
        uint256 crownCut,
        uint256 toMakers
    );
    event FeesClaimed(address indexed maker, uint256 amount);
    event ProtocolFeesWithdrawn(address indexed to, uint256 amount);
    event RandomnessUpdated(address indexed randomness);
    event PackNavCheckpointed(uint256 indexed tokenId, address indexed maker, uint256 previousNav, uint256 nav);
    event CrownTaken(address indexed maker, address indexed previousMaker, uint256 nav, uint256 previousNav);
    event CrownVacated(address indexed maker);
    event CrownPaid(address indexed maker, uint256 amount);

    error ZeroAddress();
    error NotPackCreator(uint256 tokenId, address caller);
    error PackNotListed(uint256 tokenId);
    error PackAlreadyResting(uint256 tokenId);
    error PackNotResting(uint256 tokenId);
    error EmptyEligibleSet();
    error DegenerateEligibleSet(uint256 eligible, uint256 count);
    error CountOutOfRange(uint256 count, uint256 maxBatchSize);
    error SlippageExceeded(uint256 totalPaid, uint256 maxTotalPayment);
    error NothingToClaim();
    error ZeroAmount();
    error NavUnavailable(uint256 tokenId);

    /// @dev Eligible snapshot + priced batch totals.
    struct Eligible {
        uint256[] tokenIds;
        uint256[] navs;
        uint256 count;
    }

    /// @dev Per-unit and batch totals in stablecoin units (plus WAD unit price for events).
    struct RipQuote {
        uint256 unitPriceWad;
        uint256 hm;
        uint256 unitStable;
        uint256 totalPaid;
        uint256 protocolCutUnit;
        uint256 crownCutUnit;
        uint256 toMakersUnit;
        uint256 protocolCutTotal;
        uint256 crownCutTotal;
        uint256 toMakersTotal;
        address crownPayee;
    }

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

    /// @notice True while the Pack is in the resting set.
    function isResting(uint256 tokenId) public view returns (bool) {
        return _restingIndex[tokenId] != 0;
    }

    /// @notice Enroll a listed Pack into the resting set. Maker-only.
    /// @dev Snapshots `makerOf`, the fee checkpoint, and the Pack's NAV for Crown totals. Listed
    ///      Packs accrue the equal-rate Acquisition Fee while enrolled (including temporarily
    ///      undrawable / out-of-band). Unlisted Packs are purged before socialization and never
    ///      accrue. Enrollment never fails on a bad feed: an unreadable NAV checkpoints as zero
    ///      and contributes nothing to the Crown until someone calls `syncPackNav`.
    function enterPool(uint256 tokenId) external nonReentrant {
        if (!packs.isListed(tokenId)) revert PackNotListed(tokenId);
        address creator = packs.creatorOf(tokenId);
        if (msg.sender != creator) revert NotPackCreator(tokenId, msg.sender);
        if (isResting(tokenId)) revert PackAlreadyResting(tokenId);

        makerOf[tokenId] = creator;
        feeCheckpoint[tokenId] = accFeePerPack;
        _addResting(tokenId);

        emit PackEntered(tokenId, creator);

        (, uint256 nav) = _tryNav(tokenId);
        _checkpointNav(tokenId, creator, nav);
    }

    /// @notice Remove a Pack from the resting set.
    /// @dev Maker may exit while listed. Anyone may exit once unlisted (ripped / transferred /
    ///      redeemed). Crystallizes pending fees into `claimableFees` then clears enrollment.
    function exitPool(uint256 tokenId) external nonReentrant {
        if (!isResting(tokenId)) revert PackNotResting(tokenId);

        address maker = makerOf[tokenId];
        if (packs.isListed(tokenId) && msg.sender != maker) {
            revert NotPackCreator(tokenId, msg.sender);
        }

        _leavePool(tokenId);
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
    /// @dev Drops Packs that are not listed, fail nav (frozen/stale/invalid), or are out of band.
    function eligibleSnapshot()
        public
        view
        returns (uint256[] memory tokenIds, uint256[] memory navs, uint256 eligibleCount)
    {
        Eligible memory e = _eligible();
        return (e.tokenIds, e.navs, e.count);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Live pricing + Rip
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Quote a batch Rip off a single eligible snapshot.
    function quoteRip(uint256 count)
        public
        view
        returns (uint256 eligible, uint256 hm, uint256 unitPrice, uint256 totalPayment)
    {
        (Eligible memory e, RipQuote memory q) = _quote(count);
        return (e.count, q.hm, q.unitPriceWad, q.totalPaid);
    }

    /// @notice Rip `count` distinct Packs. Priced off one snapshot; settles Model A.
    /// @param count Packs to draw (1..maxBatchSize); requires eligibleCount > count.
    /// @param maxTotalPayment Slippage bound in stablecoin units (live pricing).
    /// @return tokenIds Drawn Pack ids, now held by the Taker.
    function rip(uint256 count, uint256 maxTotalPayment) external nonReentrant returns (uint256[] memory tokenIds) {
        // Drop unlisted ghosts before selection and fee socialization.
        _purgeUnlisted();

        (Eligible memory e, RipQuote memory q) = _quote(count);
        if (q.totalPaid > maxTotalPayment) revert SlippageExceeded(q.totalPaid, maxTotalPayment);

        stablecoin.safeTransferFrom(msg.sender, address(this), q.totalPaid);
        protocolAccrued += q.protocolCutTotal;
        // Credited before the draws so the Maker who was Crowned at Rip time is paid even when
        // this Rip empties their resting set and vacates the Crown.
        _payCrown(q.crownPayee, q.crownCutTotal);

        tokenIds = _settleDraws(e, count, q);
        _socialize(q.toMakersTotal);

        emit RipSettled(
            msg.sender, count, q.unitPriceWad, q.totalPaid, q.protocolCutTotal, q.crownCutTotal, q.toMakersTotal
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Crown
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Maker paid `crown_cut` by a Rip settling now; zero when the Crown is off or vacant.
    function crownPayee() public view returns (address) {
        return registry.crownEnabled() ? crownedMaker : address(0);
    }

    /// @notice Total resting NAV (WAD USD) a challenger must reach to take the Crown.
    /// @dev `reigning × (1 + crownBeatMargin)`, and always at least one wei above the reigning
    ///      total so a `crownBeatMargin` of zero still cannot flicker the Crown on a tie.
    function crownThreshold() public view returns (uint256) {
        uint256 reigningNav = restingNavOf[crownedMaker];
        uint256 margined = reigningNav + (reigningNav * registry.crownBeatMargin()) / WAD;
        return margined > reigningNav ? margined : reigningNav + 1;
    }

    /// @notice Re-read a resting Pack's NAV into its Maker's Crown total, then re-run the
    ///         challenge. Permissionless — the Maker registers a top-up, anyone trues up a
    ///         price move in either direction.
    /// @dev Fails closed on an unreadable feed, so an oracle gap can never be used to zero a
    ///      Maker's total and knock them off the Crown.
    function syncPackNav(uint256 tokenId) external nonReentrant returns (uint256 nav) {
        if (!isResting(tokenId)) revert PackNotResting(tokenId);

        bool ok;
        (ok, nav) = _tryNav(tokenId);
        if (!ok) revert NavUnavailable(tokenId);

        _checkpointNav(tokenId, makerOf[tokenId], nav);
    }

    /// @notice Challenge the Crown on behalf of `challenger`, using checkpointed totals.
    /// @dev Permissionless and idempotent; a challenge that falls short is a no-op. Needed
    ///      because the reigning Maker's total can fall without the challenger touching the
    ///      pool, and the Crown only ever moves on an explicit beat.
    /// @return taken True when the Crown changed hands.
    function challengeCrown(address challenger) external returns (bool taken) {
        return _challenge(challenger);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Acquisition Fee claims + protocol withdrawal
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Pending Acquisition Fee for a resting Pack (stablecoin units), including uncrystallized.
    function pendingOf(uint256 tokenId) public view returns (uint256) {
        if (!isResting(tokenId)) return 0;
        return accFeePerPack - feeCheckpoint[tokenId];
    }

    /// @notice Crystallize optional Pack ids owned by the caller, then withdraw all claimable fees.
    /// @param tokenIds Resting Packs to crystallize first; empty withdraws already-crystallized only.
    function claim(uint256[] calldata tokenIds) external nonReentrant returns (uint256 amount) {
        for (uint256 i; i < tokenIds.length; ++i) {
            uint256 tokenId = tokenIds[i];
            if (!isResting(tokenId)) continue;
            if (makerOf[tokenId] != msg.sender) continue;
            _crystallize(tokenId);
        }
        amount = _withdrawClaimable(msg.sender);
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

    /// @notice Sum USD NAV of a Pack via registry quotes (no basket reshape). Fail-closed.
    /// @dev External so `_tryNav` can wrap it in try/catch.
    function navOfPack(uint256 tokenId) external view returns (uint256 nav) {
        PackCustody.BasketEntry[] memory basket = packs.basketOf(tokenId);
        uint256 length = basket.length;
        if (length == 0) revert AssetRegistry.EmptyBasket();
        for (uint256 i; i < length; ++i) {
            nav += registry.quote(basket[i].asset, basket[i].amount);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internals — quote / settle
    // ─────────────────────────────────────────────────────────────────────────

    function _quote(uint256 count) internal view returns (Eligible memory e, RipQuote memory q) {
        if (count == 0 || count > registry.maxBatchSize()) {
            revert CountOutOfRange(count, registry.maxBatchSize());
        }

        e = _eligible();
        if (e.count == 0) revert EmptyEligibleSet();
        if (e.count <= count) revert DegenerateEligibleSet(e.count, count);

        q = _priceRip(e.navs, count);
    }

    function _eligible() internal view returns (Eligible memory e) {
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

        e.tokenIds = new uint256[](count);
        e.navs = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            e.tokenIds[i] = idsBuf[i];
            e.navs[i] = navBuf[i];
        }
        e.count = count;
    }

    function _priceRip(uint256[] memory navs, uint256 count) internal view returns (RipQuote memory q) {
        uint256 surcharge = registry.surcharge();
        q.hm = RipMath.harmonicMean(navs);
        q.unitPriceWad = RipMath.clampUnitPrice(q.hm, surcharge, registry.minPackNav(), registry.poolMax());
        q.unitStable = _wadToStable(q.unitPriceWad);
        q.totalPaid = q.unitStable * count;

        // Split from the paid unit so "base never cut" holds under band clamp.
        uint256 baseStable = (q.unitStable * WAD) / (WAD + surcharge);
        uint256 surStable = q.unitStable - baseStable;
        q.protocolCutUnit = (surStable * registry.protocolShareOfSurcharge()) / WAD;

        // Crown carve comes out of the same surcharge; a vacant or disabled Crown carves nothing
        // and the whole remainder socializes. Registry caps the two shares at 1 combined, so
        // `toMakersUnit >= baseStable` — the base is never cut.
        q.crownPayee = crownPayee();
        if (q.crownPayee != address(0)) {
            q.crownCutUnit = (surStable * registry.crownShareOfSurcharge()) / WAD;
        }

        q.toMakersUnit = q.unitStable - q.protocolCutUnit - q.crownCutUnit;
        q.protocolCutTotal = q.protocolCutUnit * count;
        q.crownCutTotal = q.crownCutUnit * count;
        q.toMakersTotal = q.toMakersUnit * count;
    }

    function _settleDraws(Eligible memory e, uint256 count, RipQuote memory q)
        internal
        returns (uint256[] memory tokenIds)
    {
        uint256[] memory weights = new uint256[](e.count);
        {
            uint256 alpha = registry.alpha();
            for (uint256 i; i < e.count; ++i) {
                weights[i] = RipMath.weightOf(e.navs[i], alpha);
            }
        }

        uint256[] memory drawnIdx;
        {
            uint256 seed = randomness.nextSeed(keccak256(abi.encode(count, e.count, _resting.length, msg.sender)));
            drawnIdx = RipMath.drawDistinct(weights, seed, count);
        }

        tokenIds = new uint256[](count);
        for (uint256 k; k < count; ++k) {
            uint256 idx = drawnIdx[k];
            uint256 tokenId = e.tokenIds[idx];
            tokenIds[k] = tokenId;
            _finalizeDrawnPack(tokenId, msg.sender, e.navs[idx], q);
        }
    }

    function _finalizeDrawnPack(uint256 tokenId, address taker, uint256 nav, RipQuote memory q) internal {
        address maker = makerOf[tokenId];
        _leavePool(tokenId);
        packs.releaseToRecipient(tokenId, taker);
        emit PackRipped(tokenId, taker, maker, nav, q.unitPriceWad, q.protocolCutUnit, q.crownCutUnit, q.toMakersUnit);
    }

    function _payCrown(address payee, uint256 amount) internal {
        if (payee == address(0) || amount == 0) return;
        claimableFees[payee] += amount;
        emit CrownPaid(payee, amount);
    }

    function _socialize(uint256 toMakersTotal) internal {
        // Guaranteed remaining > 0 by eligibleCount > count after purge + draws.
        uint256 remaining = _resting.length;
        uint256 distributable = toMakersTotal + feeDust;
        uint256 perPack = distributable / remaining;
        feeDust = distributable % remaining;
        if (perPack > 0) {
            accFeePerPack += perPack;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internals — pool membership
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Crystallize, drop the Pack's NAV out of Crown totals, remove from resting set,
    ///      clear enrollment storage. Covers every departure: exit, purge, and draw-out.
    function _leavePool(uint256 tokenId) internal {
        address maker = makerOf[tokenId];
        _crystallize(tokenId);
        _releaseNav(tokenId, maker);
        _removeResting(tokenId);
        delete makerOf[tokenId];
        delete feeCheckpoint[tokenId];
    }

    /// @dev Remove unlisted Packs from the resting set (descending so swap-pop is safe).
    function _purgeUnlisted() internal {
        uint256 i = _resting.length;
        while (i > 0) {
            unchecked {
                --i;
            }
            uint256 tokenId = _resting[i];
            if (!packs.isListed(tokenId)) {
                address maker = makerOf[tokenId];
                _leavePool(tokenId);
                emit PackExited(tokenId, maker);
            }
        }
    }

    function _addResting(uint256 tokenId) internal {
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
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internals — Crown totals
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Move a resting Pack's contribution to `nav` and re-run its Maker's Crown standing.
    ///      `restingNavOf[maker]` stays the exact sum of `navCheckpoint` over that Maker's
    ///      resting Packs, because `makerOf` is fixed for the whole enrollment.
    function _checkpointNav(uint256 tokenId, address maker, uint256 nav) internal {
        uint256 previous = navCheckpoint[tokenId];
        if (nav != previous) {
            navCheckpoint[tokenId] = nav;
            restingNavOf[maker] = restingNavOf[maker] + nav - previous;
        }

        emit PackNavCheckpointed(tokenId, maker, previous, nav);
        _recomputeCrown(maker);
    }

    /// @dev Drop a departing Pack's checkpoint out of its Maker's total.
    function _releaseNav(uint256 tokenId, address maker) internal {
        uint256 nav = navCheckpoint[tokenId];
        if (nav > 0) {
            restingNavOf[maker] -= nav;
            delete navCheckpoint[tokenId];
        }

        _recomputeCrown(maker);
    }

    /// @dev The reigning Maker keeps the Crown while their total shrinks — that hysteresis is
    ///      the point — but a Maker with nothing resting cannot hold it, so zero vacates.
    ///      Any other Maker whose total just moved gets a challenge.
    function _recomputeCrown(address maker) internal {
        if (maker != crownedMaker) {
            _challenge(maker);
            return;
        }

        if (restingNavOf[maker] == 0) {
            crownedMaker = address(0);
            emit CrownVacated(maker);
        }
    }

    /// @dev King-of-the-hill: `challenger` takes the Crown only by reaching `crownThreshold()`,
    ///      i.e. beating the reigning total by at least `crownBeatMargin`. A vacant Crown has a
    ///      threshold of one wei, so the first Maker with anything resting picks it up.
    function _challenge(address challenger) internal returns (bool taken) {
        address reigning = crownedMaker;
        if (challenger == address(0) || challenger == reigning) return false;

        uint256 challengerNav = restingNavOf[challenger];
        if (challengerNav == 0 || challengerNav < crownThreshold()) return false;

        crownedMaker = challenger;
        emit CrownTaken(challenger, reigning, challengerNav, restingNavOf[reigning]);
        return true;
    }

    function _crystallize(uint256 tokenId) internal {
        uint256 pending = accFeePerPack - feeCheckpoint[tokenId];
        if (pending > 0) {
            claimableFees[makerOf[tokenId]] += pending;
            feeCheckpoint[tokenId] = accFeePerPack;
        }
    }

    function _withdrawClaimable(address maker) internal returns (uint256 amount) {
        amount = claimableFees[maker];
        if (amount == 0) revert NothingToClaim();
        claimableFees[maker] = 0;
        stablecoin.safeTransfer(maker, amount);
        emit FeesClaimed(maker, amount);
    }

    function _tryNav(uint256 tokenId) internal view returns (bool ok, uint256 nav) {
        try this.navOfPack(tokenId) returns (uint256 value) {
            return (true, value);
        } catch {
            return (false, 0);
        }
    }

    function _wadToStable(uint256 wad) internal view returns (uint256) {
        return (wad * (10 ** uint256(stableDecimals))) / WAD;
    }
}
