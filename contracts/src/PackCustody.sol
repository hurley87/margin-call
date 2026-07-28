// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PackCustody
/// @notice ERC-721 Packs backed by a recorded basket of whitelisted Stock Tokens held
///         directly by this contract.
/// @dev Custody accounting is in raw token units; oracle NAV and selection eligibility are
///      computed elsewhere and never gate the assets recorded here. Packs are plain
///      custody-backed ERC-721s, not token-bound accounts (ADR-0004).
contract PackCustody is ERC721, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice One recorded position in a Pack's basket.
    struct BasketEntry {
        address asset;
        uint256 amount;
    }

    /// @notice Role permitted to change which assets may be deposited.
    bytes32 public constant WHITELIST_ADMIN_ROLE = keccak256("WHITELIST_ADMIN_ROLE");

    /// @notice Whether an asset may be deposited into a Pack.
    /// @dev Entry control only. Assets already recorded in a basket stay redeemable whatever
    ///      this says later, so de-whitelisting can never strand a creator's capital.
    mapping(address asset => bool whitelisted) public isWhitelisted;

    /// @notice The account that minted a Pack, and the only account that may top it up.
    mapping(uint256 tokenId => address creator) public creatorOf;

    address[] private _whitelist;

    /// @dev Distinct assets recorded for a Pack. Bounded by the whitelist size because
    ///      deposits require whitelist membership and duplicate mint entries are rejected.
    mapping(uint256 tokenId => address[] assets) private _basketAssets;

    mapping(uint256 tokenId => mapping(address asset => uint256 amount)) private _basketAmounts;

    uint256 private _lastTokenId;

    /// @notice Emitted once per Pack, with the amounts actually received into custody.
    event PackMinted(uint256 indexed tokenId, address indexed creator, address[] assets, uint256[] amounts);

    /// @notice Emitted when an asset becomes depositable.
    event AssetWhitelisted(address indexed asset);

    /// @notice Emitted when an asset stops being depositable.
    /// @dev Baskets already holding the asset are unaffected and stay fully redeemable.
    event AssetRemovedFromWhitelist(address indexed asset);

    error ZeroAddress();
    error EmptyWhitelist();
    error AlreadyWhitelisted(address asset);
    error EmptyBasket();
    error LengthMismatch();
    error AssetNotWhitelisted(address asset);
    error DuplicateAsset(address asset);
    error ZeroAmount(address asset);
    error NoAssetsReceived(address asset);

    /// @param admin Address granted DEFAULT_ADMIN_ROLE (can grant/revoke WHITELIST_ADMIN_ROLE).
    /// @param initialWhitelist Assets depositable at launch — the five approved Stock Tokens.
    constructor(address admin, address[] memory initialWhitelist) ERC721("Margin Call Pack (Test Asset)", "PACK") {
        if (admin == address(0)) revert ZeroAddress();
        if (initialWhitelist.length == 0) revert EmptyWhitelist();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);

        for (uint256 i; i < initialWhitelist.length; ++i) {
            address asset = initialWhitelist[i];
            if (asset == address(0)) revert ZeroAddress();
            if (isWhitelisted[asset]) revert AlreadyWhitelisted(asset);

            isWhitelisted[asset] = true;
            _whitelist.push(asset);
            emit AssetWhitelisted(asset);
        }
    }

    /// @notice Mint a Pack, depositing its full basket in the same transaction.
    /// @dev The caller must have approved this contract for every asset. Recorded amounts are
    ///      what custody actually received, so a fee-on-transfer asset records its net amount.
    /// @param assets Distinct whitelisted assets to deposit.
    /// @param amounts Raw token units to deposit, positionally matched to `assets`.
    /// @return tokenId The newly minted Pack.
    function mint(address[] calldata assets, uint256[] calldata amounts)
        external
        nonReentrant
        returns (uint256 tokenId)
    {
        if (assets.length == 0) revert EmptyBasket();
        if (assets.length != amounts.length) revert LengthMismatch();

        tokenId = ++_lastTokenId;
        creatorOf[tokenId] = msg.sender;

        uint256[] memory received = new uint256[](assets.length);
        for (uint256 i; i < assets.length; ++i) {
            // The Pack is new, so any recorded amount can only come from this call.
            if (_basketAmounts[tokenId][assets[i]] != 0) revert DuplicateAsset(assets[i]);
            received[i] = _deposit(tokenId, assets[i], amounts[i]);
        }

        _safeMint(msg.sender, tokenId);

        emit PackMinted(tokenId, msg.sender, assets, received);
    }

    /// @notice Allow an asset to be deposited into new and existing Packs.
    function addAsset(address asset) external onlyRole(WHITELIST_ADMIN_ROLE) {
        if (asset == address(0)) revert ZeroAddress();
        if (isWhitelisted[asset]) revert AlreadyWhitelisted(asset);

        isWhitelisted[asset] = true;
        _whitelist.push(asset);

        emit AssetWhitelisted(asset);
    }

    /// @notice Stop an asset from being deposited into any Pack.
    /// @dev Entry control only. Packs already holding `asset` keep it in their recorded basket
    ///      and release it in full on redeem and unwrap, so removal can never strand capital.
    function removeAsset(address asset) external onlyRole(WHITELIST_ADMIN_ROLE) {
        if (!isWhitelisted[asset]) revert AssetNotWhitelisted(asset);

        isWhitelisted[asset] = false;

        uint256 length = _whitelist.length;
        for (uint256 i; i < length; ++i) {
            if (_whitelist[i] == asset) {
                _whitelist[i] = _whitelist[length - 1];
                _whitelist.pop();
                break;
            }
        }

        emit AssetRemovedFromWhitelist(asset);
    }

    /// @notice The full recorded basket of a Pack, in raw token units.
    function basketOf(uint256 tokenId) external view returns (BasketEntry[] memory basket) {
        address[] storage assets = _basketAssets[tokenId];
        basket = new BasketEntry[](assets.length);
        for (uint256 i; i < assets.length; ++i) {
            basket[i] = BasketEntry({asset: assets[i], amount: _basketAmounts[tokenId][assets[i]]});
        }
    }

    /// @notice Distinct assets recorded for a Pack.
    function basketAssetsOf(uint256 tokenId) external view returns (address[] memory) {
        return _basketAssets[tokenId];
    }

    /// @notice Raw token units of a single asset recorded for a Pack.
    function basketAmountOf(uint256 tokenId, address asset) external view returns (uint256) {
        return _basketAmounts[tokenId][asset];
    }

    /// @notice Assets currently depositable into new and existing Packs.
    function whitelistedAssets() external view returns (address[] memory) {
        return _whitelist;
    }

    /// @notice Total Packs minted, including any since burned. Doubles as the last token id.
    function totalMinted() external view returns (uint256) {
        return _lastTokenId;
    }

    /// @inheritdoc ERC721
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /// @dev Pulls `amount` of `asset` into custody and records what actually arrived.
    function _deposit(uint256 tokenId, address asset, uint256 amount) internal returns (uint256 received) {
        if (!isWhitelisted[asset]) revert AssetNotWhitelisted(asset);
        if (amount == 0) revert ZeroAmount(asset);

        IERC20 token = IERC20(asset);
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        received = token.balanceOf(address(this)) - balanceBefore;
        if (received == 0) revert NoAssetsReceived(asset);

        if (_basketAmounts[tokenId][asset] == 0) {
            _basketAssets[tokenId].push(asset);
        }
        _basketAmounts[tokenId][asset] += received;
    }
}
