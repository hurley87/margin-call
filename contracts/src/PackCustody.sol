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

    /// @notice Role permitted to settle a listed Pack to a recipient (RipEngine).
    bytes32 public constant RIP_ENGINE_ROLE = keccak256("RIP_ENGINE_ROLE");

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

    /// @dev Latched the first time a Pack leaves its creator. One way: a Pack that has been
    ///      ripped or sold never rejoins the pool, so the lifecycle only ever moves forward.
    mapping(uint256 tokenId => bool unlisted) private _unlisted;

    uint256 private _lastTokenId;

    /// @notice Emitted once per Pack, with the amounts actually received into custody.
    event PackMinted(uint256 indexed tokenId, address indexed creator, address[] assets, uint256[] amounts);

    /// @notice Emitted when a creator adds assets to a listed Pack.
    event PackToppedUp(uint256 indexed tokenId, address indexed creator, address[] assets, uint256[] amounts);

    /// @notice Emitted the first time a Pack leaves its creator, retiring it from the pool.
    event PackUnlisted(uint256 indexed tokenId);

    /// @notice Emitted when a creator delists a Pack and takes its full basket back.
    event PackRedeemed(uint256 indexed tokenId, address indexed creator, address[] assets, uint256[] amounts);

    /// @notice Emitted when a holder unwraps a Pack that has left its creator.
    event PackUnwrapped(uint256 indexed tokenId, address indexed holder, address[] assets, uint256[] amounts);

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
    error NotPackCreator(uint256 tokenId, address caller);
    error NotPackHolder(uint256 tokenId, address caller);
    error PackNotListed(uint256 tokenId);
    error PackStillListed(uint256 tokenId);
    error SelfRelease(uint256 tokenId);

    /// @param admin Address granted DEFAULT_ADMIN_ROLE (can grant/revoke WHITELIST_ADMIN_ROLE
    ///        and RIP_ENGINE_ROLE).
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
        _validateDeposit(assets, amounts);

        tokenId = ++_lastTokenId;
        creatorOf[tokenId] = msg.sender;

        uint256[] memory received = new uint256[](assets.length);
        for (uint256 i; i < assets.length; ++i) {
            received[i] = _deposit(tokenId, assets[i], amounts[i]);
        }

        _safeMint(msg.sender, tokenId);

        emit PackMinted(tokenId, msg.sender, assets, received);
    }

    /// @notice Add assets to a listed Pack. Additions only — nothing can be withdrawn here.
    /// @dev Creator-only, and only while the Pack is still in the pool. A published NAV can
    ///      therefore rise between checkpoints but can never be hollowed out.
    /// @param tokenId The Pack to top up.
    /// @param assets Distinct whitelisted assets to add, new to the basket or already in it.
    /// @param amounts Raw token units to add, positionally matched to `assets`.
    function topUp(uint256 tokenId, address[] calldata assets, uint256[] calldata amounts) external nonReentrant {
        _validateDeposit(assets, amounts);
        if (!isListed(tokenId)) revert PackNotListed(tokenId);
        if (creatorOf[tokenId] != msg.sender) revert NotPackCreator(tokenId, msg.sender);

        uint256[] memory received = new uint256[](assets.length);
        for (uint256 i; i < assets.length; ++i) {
            received[i] = _deposit(tokenId, assets[i], amounts[i]);
        }

        emit PackToppedUp(tokenId, msg.sender, assets, received);
    }

    /// @notice Delist a Pack and take its entire basket back, at no protocol fee.
    /// @dev Creator-only while listed. Available at any moment — the exit right is never
    ///      delayed — so creator capital can never be trapped. Burns the Pack.
    function delistAndRedeem(uint256 tokenId) external nonReentrant {
        if (!isListed(tokenId)) revert PackNotListed(tokenId);
        if (creatorOf[tokenId] != msg.sender) revert NotPackCreator(tokenId, msg.sender);

        (address[] memory assets, uint256[] memory amounts) = _release(tokenId, msg.sender);

        emit PackRedeemed(tokenId, msg.sender, assets, amounts);
    }

    /// @notice Take the entire basket out of a Pack that has left its creator, at no protocol
    ///         fee. Available to whoever holds the Pack, however they came by it.
    /// @dev Burns the Pack. The disclosed exit for a ripped or purchased Pack; the creator's
    ///      equivalent while the Pack is still in the pool is `delistAndRedeem`.
    function unwrap(uint256 tokenId) external nonReentrant {
        if (_ownerOf(tokenId) != msg.sender) revert NotPackHolder(tokenId, msg.sender);
        if (isListed(tokenId)) revert PackStillListed(tokenId);

        (address[] memory assets, uint256[] memory amounts) = _release(tokenId, msg.sender);

        emit PackUnwrapped(tokenId, msg.sender, assets, amounts);
    }

    /// @notice Settle a listed Pack to `recipient` in one call (RipEngine settlement primitive).
    /// @dev Privileged transfer: no ERC-721 approval required. Basket accounting and ERC-20
    ///      balances stay in custody; the one-way unlisted latch fires via `_update`. A Pack
    ///      settles at most once because an already-unlisted Pack reverts `PackNotListed`.
    ///      Self-release is rejected so the latch cannot be skipped.
    /// @param tokenId The listed Pack to hand to the Taker.
    /// @param recipient The account that receives the Pack (typically the Taker).
    function releaseToRecipient(uint256 tokenId, address recipient) external onlyRole(RIP_ENGINE_ROLE) {
        if (recipient == address(0)) revert ZeroAddress();
        if (!isListed(tokenId)) revert PackNotListed(tokenId);

        address from = ownerOf(tokenId);
        if (recipient == from) revert SelfRelease(tokenId);

        _transfer(from, recipient, tokenId);
    }

    /// @notice Whether a Pack is still held by its creator and can be topped up or delisted.
    function isListed(uint256 tokenId) public view returns (bool) {
        return _ownerOf(tokenId) != address(0) && !_unlisted[tokenId];
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

    /// @dev Burns the Pack and pays its whole recorded basket to `to`, with no deduction of
    ///      any kind. Accounting is cleared before any token moves, so a hostile asset that
    ///      re-enters finds nothing left to release even before the guard rejects it.
    function _release(uint256 tokenId, address to)
        internal
        returns (address[] memory assets, uint256[] memory amounts)
    {
        assets = _basketAssets[tokenId];
        amounts = new uint256[](assets.length);

        for (uint256 i; i < assets.length; ++i) {
            amounts[i] = _basketAmounts[tokenId][assets[i]];
            delete _basketAmounts[tokenId][assets[i]];
        }

        delete _basketAssets[tokenId];
        delete creatorOf[tokenId];
        delete _unlisted[tokenId];

        _burn(tokenId);

        for (uint256 i; i < assets.length; ++i) {
            IERC20(assets[i]).safeTransfer(to, amounts[i]);
        }
    }

    /// @dev Latches the Pack out of the pool on its first move to a new holder. Mints, burns,
    ///      and self-transfers are not departures.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);

        if (from != address(0) && to != address(0) && to != from && !_unlisted[tokenId]) {
            _unlisted[tokenId] = true;
            emit PackUnlisted(tokenId);
        }
    }

    /// @dev Shared shape check for mint and top-up: non-empty, aligned, and free of duplicates.
    function _validateDeposit(address[] calldata assets, uint256[] calldata amounts) internal pure {
        if (assets.length == 0) revert EmptyBasket();
        if (assets.length != amounts.length) revert LengthMismatch();

        for (uint256 i; i < assets.length; ++i) {
            for (uint256 j; j < i; ++j) {
                if (assets[i] == assets[j]) revert DuplicateAsset(assets[i]);
            }
        }
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
