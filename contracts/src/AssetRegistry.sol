// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IPriceFeed} from "./interfaces/IPriceFeed.sol";

/// @title AssetRegistry
/// @notice Owner-curated Stock Token whitelist, pool levers, and fail-closed Pack NAV.
/// @dev Custody stays in PackCustody (raw token units). This contract is the game's view of
///      feeds, status, band, and USD NAV. RipEngine (later) consumes these reads.
contract AssetRegistry is AccessControl {
    /// @notice Role permitted to bump/decrement per-asset inventory (RipEngine / custody bridge).
    bytes32 public constant INVENTORY_ROLE = keccak256("INVENTORY_ROLE");

    /// @notice WAD scale for ratio levers (`alpha`, `surcharge`, shares, margins) and USD NAV.
    uint256 public constant WAD = 1e18;

    /// @notice Lifecycle of an approved Stock Token.
    enum Status {
        Unlisted,
        Active,
        Frozen,
        Delisting
    }

    /// @notice Per-asset configuration and live inventory.
    struct Asset {
        address feed;
        uint64 staleAfter;
        Status status;
        uint8 tokenDecimals;
        uint256 inventory;
    }

    mapping(address token => Asset) private _assets;
    address[] private _listed;

    uint256 public minPackNav;
    uint256 public poolMax;
    uint256 public alpha;
    uint256 public surcharge;
    uint256 public protocolShareOfSurcharge;
    uint256 public maxBatchSize;

    bool public crownEnabled;
    uint256 public crownShareOfSurcharge;
    uint256 public crownBeatMargin;

    event AssetAdded(address indexed token, address indexed feed, uint64 staleAfter, uint8 tokenDecimals);
    event AssetStatusSet(address indexed token, Status indexed status);
    event AssetRemoved(address indexed token);
    event AssetFeedUpdated(address indexed token, address indexed feed, uint64 staleAfter);
    event InventoryAdjusted(address indexed token, uint256 inventory, int256 delta);

    event MinPackNavSet(uint256 minPackNav);
    event PoolMaxSet(uint256 poolMax);
    event AlphaSet(uint256 alpha);
    event SurchargeSet(uint256 surcharge);
    event ProtocolShareOfSurchargeSet(uint256 protocolShareOfSurcharge);
    event MaxBatchSizeSet(uint256 maxBatchSize);
    event CrownEnabledSet(bool crownEnabled);
    event CrownShareOfSurchargeSet(uint256 crownShareOfSurcharge);
    event CrownBeatMarginSet(uint256 crownBeatMargin);

    error ZeroAddress();
    error ZeroStaleAfter();
    error AssetAlreadyListed(address token);
    error AssetNotListed(address token);
    error InvalidStatusTransition(Status from, Status to);
    error InventoryNotZero(address token, uint256 inventory);
    error InventoryUnderflow(address token, uint256 inventory, uint256 decrease);
    error InvalidBand(uint256 minPackNav, uint256 poolMax);
    error ZeroMinPackNav();
    error ZeroMaxBatchSize();
    error RatioTooHigh(uint256 value);
    error LengthMismatch();
    error EmptyBasket();
    error ZeroAmount(address token);
    error DuplicateAsset(address token);
    error AssetNotInPriceBasket(address token, Status status);
    error FeedInvalid(address token);
    error FeedPaused(address token);
    error FeedStale(address token, uint256 updatedAt, uint64 staleAfter, uint256 now_);
    error FeedZeroPrice(address token);

    /// @param admin DEFAULT_ADMIN_ROLE holder (owner setters + asset curation).
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);

        // PRD launch defaults — USD NAV in WAD ($1 = 1e18).
        minPackNav = 20 * WAD;
        poolMax = 300 * WAD;
        alpha = WAD; // 1.0
        surcharge = WAD / 10; // 0.10
        protocolShareOfSurcharge = WAD / 4; // 0.25
        maxBatchSize = 5;
        crownEnabled = false;
        crownShareOfSurcharge = WAD / 10; // 0.10 when enabled
        crownBeatMargin = WAD / 10; // 0.10
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Asset lifecycle
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Register a Stock Token with its price feed. Starts `Active`.
    function addAsset(address token, address feed, uint64 staleAfter) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0) || feed == address(0)) revert ZeroAddress();
        if (staleAfter == 0) revert ZeroStaleAfter();
        if (_assets[token].status != Status.Unlisted) revert AssetAlreadyListed(token);

        uint8 tokenDecimals = IERC20Metadata(token).decimals();
        _assets[token] = Asset({
            feed: feed, staleAfter: staleAfter, status: Status.Active, tokenDecimals: tokenDecimals, inventory: 0
        });
        _listed.push(token);

        emit AssetAdded(token, feed, staleAfter, tokenDecimals);
        emit AssetStatusSet(token, Status.Active);
    }

    /// @notice Update feed and/or staleness bound for a listed asset (prospective).
    function setAssetFeed(address token, address feed, uint64 staleAfter) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Asset storage asset = _requireListed(token);
        if (feed == address(0)) revert ZeroAddress();
        if (staleAfter == 0) revert ZeroStaleAfter();
        asset.feed = feed;
        asset.staleAfter = staleAfter;
        emit AssetFeedUpdated(token, feed, staleAfter);
    }

    /// @notice Move a listed asset between Active / Frozen / Delisting.
    /// @dev Cannot set Unlisted here — use `removeAsset` after inventory drains.
    function setStatus(address token, Status status) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Asset storage asset = _requireListed(token);
        if (status == Status.Unlisted) revert InvalidStatusTransition(asset.status, status);
        if (status != Status.Active && status != Status.Frozen && status != Status.Delisting) {
            revert InvalidStatusTransition(asset.status, status);
        }
        asset.status = status;
        emit AssetStatusSet(token, status);
    }

    /// @notice Remove an asset only when inventory is zero (drain-then-delete).
    function removeAsset(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Asset storage asset = _requireListed(token);
        if (asset.inventory != 0) revert InventoryNotZero(token, asset.inventory);

        delete _assets[token];
        _removeListed(token);
        emit AssetRemoved(token);
        emit AssetStatusSet(token, Status.Unlisted);
    }

    /// @notice Adjust live inventory for a listed asset. Positive increases; negative decreases.
    /// @dev Intended for RipEngine / custody bridge via `INVENTORY_ROLE`.
    function adjustInventory(address token, int256 delta) external onlyRole(INVENTORY_ROLE) {
        Asset storage asset = _requireListed(token);
        if (delta >= 0) {
            asset.inventory += uint256(delta);
        } else {
            uint256 decrease = uint256(-delta);
            if (decrease > asset.inventory) revert InventoryUnderflow(token, asset.inventory, decrease);
            asset.inventory -= decrease;
        }
        emit InventoryAdjusted(token, asset.inventory, delta);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Owner pool / crown setters (evented, prospective)
    // ─────────────────────────────────────────────────────────────────────────

    function setMinPackNav(uint256 newMinPackNav) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newMinPackNav == 0) revert ZeroMinPackNav();
        if (newMinPackNav > poolMax) revert InvalidBand(newMinPackNav, poolMax);
        minPackNav = newMinPackNav;
        emit MinPackNavSet(newMinPackNav);
    }

    function setPoolMax(uint256 newPoolMax) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newPoolMax < minPackNav) revert InvalidBand(minPackNav, newPoolMax);
        poolMax = newPoolMax;
        emit PoolMaxSet(newPoolMax);
    }

    function setAlpha(uint256 newAlpha) external onlyRole(DEFAULT_ADMIN_ROLE) {
        alpha = newAlpha;
        emit AlphaSet(newAlpha);
    }

    function setSurcharge(uint256 newSurcharge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newSurcharge > WAD) revert RatioTooHigh(newSurcharge);
        surcharge = newSurcharge;
        emit SurchargeSet(newSurcharge);
    }

    function setProtocolShareOfSurcharge(uint256 newShare) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newShare > WAD) revert RatioTooHigh(newShare);
        if (newShare + crownShareOfSurcharge > WAD) revert RatioTooHigh(newShare + crownShareOfSurcharge);
        protocolShareOfSurcharge = newShare;
        emit ProtocolShareOfSurchargeSet(newShare);
    }

    function setMaxBatchSize(uint256 newMaxBatchSize) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newMaxBatchSize == 0) revert ZeroMaxBatchSize();
        maxBatchSize = newMaxBatchSize;
        emit MaxBatchSizeSet(newMaxBatchSize);
    }

    function setCrownEnabled(bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        crownEnabled = enabled;
        emit CrownEnabledSet(enabled);
    }

    function setCrownShareOfSurcharge(uint256 newShare) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newShare > WAD) revert RatioTooHigh(newShare);
        if (protocolShareOfSurcharge + newShare > WAD) {
            revert RatioTooHigh(protocolShareOfSurcharge + newShare);
        }
        crownShareOfSurcharge = newShare;
        emit CrownShareOfSurchargeSet(newShare);
    }

    function setCrownBeatMargin(uint256 newMargin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newMargin > WAD) revert RatioTooHigh(newMargin);
        crownBeatMargin = newMargin;
        emit CrownBeatMarginSet(newMargin);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views — status helpers for RipEngine
    // ─────────────────────────────────────────────────────────────────────────

    function getAsset(address token) external view returns (Asset memory) {
        return _assets[token];
    }

    function listedAssets() external view returns (address[] memory) {
        return _listed;
    }

    function listedCount() external view returns (uint256) {
        return _listed.length;
    }

    /// @notice True when new deposits of `token` are allowed (Active only).
    function isDepositable(address token) public view returns (bool) {
        return _assets[token].status == Status.Active;
    }

    /// @notice True when `token` participates in selection weight and the price basket.
    /// @dev Frozen is excluded. Delisting stays in so resting Packs can drain.
    function isInPriceBasket(address token) public view returns (bool) {
        Status status = _assets[token].status;
        return status == Status.Active || status == Status.Delisting;
    }

    /// @notice True when `nav` lies in `[minPackNav, poolMax]` (WAD USD).
    function isNavInBand(uint256 nav) public view returns (bool) {
        return nav >= minPackNav && nav <= poolMax;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────────────────

    function _requireListed(address token) internal view returns (Asset storage asset) {
        asset = _assets[token];
        if (asset.status == Status.Unlisted) revert AssetNotListed(token);
    }

    function _removeListed(address token) internal {
        uint256 length = _listed.length;
        for (uint256 i; i < length; ++i) {
            if (_listed[i] == token) {
                _listed[i] = _listed[length - 1];
                _listed.pop();
                return;
            }
        }
    }
}
