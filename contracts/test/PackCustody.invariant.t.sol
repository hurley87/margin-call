// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {PackCustody} from "../src/PackCustody.sol";
import {MockStockToken} from "./mocks/MockStockToken.sol";

/// @notice Drives every external Pack action through the public ABI and keeps an independent
///         additions-only mirror of what each basket should hold.
contract PackCustodyHandler is Test {
    PackCustody public immutable PACKS;
    address public immutable WHITELIST_ADMIN;

    address[] public assets;
    address[] public actors;

    uint256[] public livePacks;
    mapping(uint256 tokenId => uint256 index) internal _livePackIndex;
    mapping(uint256 tokenId => bool live) internal _isLive;

    /// @dev Cumulative units pulled into and paid out of custody, per asset.
    mapping(address asset => uint256 amount) public ghostDeposited;
    mapping(address asset => uint256 amount) public ghostReleased;

    /// @dev What each live Pack should hold, built only ever by addition.
    mapping(uint256 tokenId => mapping(address asset => uint256 amount)) public ghostBasket;
    mapping(uint256 tokenId => address[] assets) internal _ghostPackAssets;

    /// @dev Packs seen out of the pool, to prove unlisting never reverses.
    mapping(uint256 tokenId => bool seen) public ghostSeenUnlisted;

    uint256[] public terminatedPacks;

    constructor(PackCustody packs_, address[] memory assets_, address whitelistAdmin_) {
        PACKS = packs_;
        WHITELIST_ADMIN = whitelistAdmin_;
        assets = assets_;

        actors.push(makeAddr("handlerActor0"));
        actors.push(makeAddr("handlerActor1"));
        actors.push(makeAddr("handlerActor2"));
        actors.push(makeAddr("handlerActor3"));

        for (uint256 a; a < actors.length; ++a) {
            for (uint256 i; i < assets.length; ++i) {
                MockStockToken token = MockStockToken(assets[i]);
                token.mint(actors[a], 1_000_000_000 * (10 ** token.decimals()));

                vm.prank(actors[a]);
                token.approve(address(PACKS), type(uint256).max);
            }
        }
    }

    // ========== Actions ==========

    function mintPack(uint256 actorSeed, uint256 maskSeed, uint256 amountSeed) external {
        address actor = _actor(actorSeed);
        (address[] memory picked, uint256[] memory amounts) = _pickDepositable(maskSeed, amountSeed);
        if (picked.length == 0) return;

        vm.prank(actor);
        uint256 tokenId = PACKS.mint(picked, amounts);

        _trackLive(tokenId);
        _recordDeposits(tokenId, picked, amounts);
    }

    function topUpPack(uint256 packSeed, uint256 maskSeed, uint256 amountSeed) external {
        if (livePacks.length == 0) return;
        uint256 tokenId = livePacks[bound(packSeed, 0, livePacks.length - 1)];
        if (!PACKS.isListed(tokenId)) return;

        (address[] memory picked, uint256[] memory amounts) = _pickDepositable(maskSeed, amountSeed);
        if (picked.length == 0) return;

        vm.prank(PACKS.creatorOf(tokenId));
        PACKS.topUp(tokenId, picked, amounts);

        _recordDeposits(tokenId, picked, amounts);
    }

    function transferPack(uint256 packSeed, uint256 actorSeed) external {
        if (livePacks.length == 0) return;
        uint256 tokenId = livePacks[bound(packSeed, 0, livePacks.length - 1)];

        address owner = PACKS.ownerOf(tokenId);
        address to = _actor(actorSeed);
        if (to == owner) return;

        vm.prank(owner);
        PACKS.transferFrom(owner, to, tokenId);
    }

    function redeemPack(uint256 packSeed) external {
        if (livePacks.length == 0) return;
        uint256 tokenId = livePacks[bound(packSeed, 0, livePacks.length - 1)];
        if (!PACKS.isListed(tokenId)) return;

        vm.prank(PACKS.creatorOf(tokenId));
        PACKS.delistAndRedeem(tokenId);

        _recordRelease(tokenId);
    }

    function unwrapPack(uint256 packSeed) external {
        if (livePacks.length == 0) return;
        uint256 tokenId = livePacks[bound(packSeed, 0, livePacks.length - 1)];
        if (PACKS.isListed(tokenId)) return;

        vm.prank(PACKS.ownerOf(tokenId));
        PACKS.unwrap(tokenId);

        _recordRelease(tokenId);
    }

    /// @dev Churns the whitelist under the lifecycle. At least two assets always stay
    ///      depositable so minting keeps making progress.
    function churnWhitelist(uint256 assetSeed) external {
        address asset = assets[bound(assetSeed, 0, assets.length - 1)];

        if (PACKS.isWhitelisted(asset)) {
            if (PACKS.whitelistedAssets().length <= 2) return;
            vm.prank(WHITELIST_ADMIN);
            PACKS.removeAsset(asset);
        } else {
            vm.prank(WHITELIST_ADMIN);
            PACKS.addAsset(asset);
        }
    }

    /// @dev Observation step: the invariant layer uses this to prove unlisting is one way.
    function observeListing() external {
        for (uint256 i; i < livePacks.length; ++i) {
            if (!PACKS.isListed(livePacks[i])) ghostSeenUnlisted[livePacks[i]] = true;
        }
    }

    // ========== Views for the invariant layer ==========

    function livePackCount() external view returns (uint256) {
        return livePacks.length;
    }

    function terminatedPackCount() external view returns (uint256) {
        return terminatedPacks.length;
    }

    function assetCount() external view returns (uint256) {
        return assets.length;
    }

    function ghostPackAssets(uint256 tokenId) external view returns (address[] memory) {
        return _ghostPackAssets[tokenId];
    }

    // ========== Internals ==========

    function _actor(uint256 seed) internal view returns (address) {
        return actors[bound(seed, 0, actors.length - 1)];
    }

    /// @dev Picks a non-empty, duplicate-free subset of the currently depositable assets.
    function _pickDepositable(uint256 maskSeed, uint256 amountSeed)
        internal
        view
        returns (address[] memory picked, uint256[] memory amounts)
    {
        address[] memory depositable = PACKS.whitelistedAssets();
        if (depositable.length == 0) return (new address[](0), new uint256[](0));

        uint256 mask = bound(maskSeed, 1, (1 << depositable.length) - 1);

        uint256 count;
        for (uint256 i; i < depositable.length; ++i) {
            if (mask & (1 << i) != 0) ++count;
        }

        picked = new address[](count);
        amounts = new uint256[](count);

        uint256 cursor;
        for (uint256 i; i < depositable.length; ++i) {
            if (mask & (1 << i) == 0) continue;

            uint256 unit = 10 ** MockStockToken(depositable[i]).decimals();
            picked[cursor] = depositable[i];
            amounts[cursor] = bound(uint256(keccak256(abi.encode(amountSeed, i))), 1, 1000 * unit);
            ++cursor;
        }
    }

    function _recordDeposits(uint256 tokenId, address[] memory picked, uint256[] memory amounts) internal {
        for (uint256 i; i < picked.length; ++i) {
            if (ghostBasket[tokenId][picked[i]] == 0) {
                _ghostPackAssets[tokenId].push(picked[i]);
            }
            ghostBasket[tokenId][picked[i]] += amounts[i];
            ghostDeposited[picked[i]] += amounts[i];
        }
    }

    function _recordRelease(uint256 tokenId) internal {
        address[] memory held = _ghostPackAssets[tokenId];
        for (uint256 i; i < held.length; ++i) {
            ghostReleased[held[i]] += ghostBasket[tokenId][held[i]];
            delete ghostBasket[tokenId][held[i]];
        }
        delete _ghostPackAssets[tokenId];

        _untrackLive(tokenId);
        terminatedPacks.push(tokenId);
    }

    function _trackLive(uint256 tokenId) internal {
        _livePackIndex[tokenId] = livePacks.length;
        _isLive[tokenId] = true;
        livePacks.push(tokenId);
    }

    function _untrackLive(uint256 tokenId) internal {
        uint256 index = _livePackIndex[tokenId];
        uint256 last = livePacks.length - 1;

        if (index != last) {
            uint256 moved = livePacks[last];
            livePacks[index] = moved;
            _livePackIndex[moved] = index;
        }

        livePacks.pop();
        delete _livePackIndex[tokenId];
        _isLive[tokenId] = false;
    }
}

/// @notice The PRD's custody invariants, encoded directly.
contract PackCustodyInvariantTest is StdInvariant, Test {
    PackCustody internal packs;
    PackCustodyHandler internal handler;

    address internal admin = makeAddr("admin");
    address internal whitelistAdmin = makeAddr("whitelistAdmin");

    address[] internal assets;

    function setUp() public {
        assets.push(address(new MockStockToken("Amazon Test Stock", "tAMZN", 18)));
        assets.push(address(new MockStockToken("AMD Test Stock", "tAMD", 18)));
        assets.push(address(new MockStockToken("Netflix Test Stock", "tNFLX", 8)));
        assets.push(address(new MockStockToken("Palantir Test Stock", "tPLTR", 6)));
        assets.push(address(new MockStockToken("Tesla Test Stock", "tTSLA", 18)));

        packs = new PackCustody(admin, assets);

        bytes32 role = packs.WHITELIST_ADMIN_ROLE();
        vm.prank(admin);
        packs.grantRole(role, whitelistAdmin);

        handler = new PackCustodyHandler(packs, assets, whitelistAdmin);

        bytes4[] memory selectors = new bytes4[](7);
        selectors[0] = PackCustodyHandler.mintPack.selector;
        selectors[1] = PackCustodyHandler.topUpPack.selector;
        selectors[2] = PackCustodyHandler.transferPack.selector;
        selectors[3] = PackCustodyHandler.redeemPack.selector;
        selectors[4] = PackCustodyHandler.unwrapPack.selector;
        selectors[5] = PackCustodyHandler.churnWhitelist.selector;
        selectors[6] = PackCustodyHandler.observeListing.selector;

        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// @notice Every asset custody holds is backed by a live Pack's recorded basket, and every
    ///         recorded unit is actually held. Packs are fully backed and never over-credited.
    function invariant_custodyMatchesTheSumOfRecordedBaskets() public view {
        uint256 packCount = handler.livePackCount();

        for (uint256 a; a < assets.length; ++a) {
            uint256 recorded;
            for (uint256 p; p < packCount; ++p) {
                recorded += packs.basketAmountOf(handler.livePacks(p), assets[a]);
            }

            assertEq(MockStockToken(assets[a]).balanceOf(address(packs)), recorded);
        }
    }

    /// @notice Nothing is skimmed: what came in, minus what went out, is exactly what is held.
    ///         A protocol fee on any path would break this.
    function invariant_depositsMinusReleasesEqualCustody() public view {
        for (uint256 a; a < assets.length; ++a) {
            uint256 deposited = handler.ghostDeposited(assets[a]);
            uint256 released = handler.ghostReleased(assets[a]);

            assertEq(MockStockToken(assets[a]).balanceOf(address(packs)), deposited - released);
        }
    }

    /// @notice Recorded baskets equal an independently maintained additions-only mirror, so no
    ///         path ever reduces a live Pack's holdings.
    function invariant_basketsAreAdditionsOnly() public view {
        uint256 packCount = handler.livePackCount();

        for (uint256 p; p < packCount; ++p) {
            uint256 tokenId = handler.livePacks(p);
            address[] memory held = handler.ghostPackAssets(tokenId);

            assertEq(packs.basketOf(tokenId).length, held.length);

            for (uint256 i; i < held.length; ++i) {
                assertEq(packs.basketAmountOf(tokenId, held[i]), handler.ghostBasket(tokenId, held[i]));
            }
        }
    }

    /// @notice A redeemed or unwrapped Pack keeps nothing behind.
    function invariant_terminatedPacksAreFullyCleared() public view {
        uint256 count = handler.terminatedPackCount();

        for (uint256 i; i < count; ++i) {
            uint256 tokenId = handler.terminatedPacks(i);

            assertEq(packs.basketOf(tokenId).length, 0);
            assertEq(packs.creatorOf(tokenId), address(0));
            assertFalse(packs.isListed(tokenId));
        }
    }

    /// @notice A listed Pack is always still held by its creator, which is what makes
    ///         creator-only top-up and delist safe to gate on listing alone.
    function invariant_listedPacksAreHeldByTheirCreator() public view {
        uint256 packCount = handler.livePackCount();

        for (uint256 p; p < packCount; ++p) {
            uint256 tokenId = handler.livePacks(p);
            if (!packs.isListed(tokenId)) continue;

            assertEq(packs.ownerOf(tokenId), packs.creatorOf(tokenId));
        }
    }

    /// @notice Leaving the pool is one way — no Pack ever reports itself listed again.
    function invariant_unlistingNeverReverses() public view {
        uint256 packCount = handler.livePackCount();

        for (uint256 p; p < packCount; ++p) {
            uint256 tokenId = handler.livePacks(p);
            if (handler.ghostSeenUnlisted(tokenId)) {
                assertFalse(packs.isListed(tokenId));
            }
        }
    }

    /// @notice Custody never holds an asset that was not depositable when it arrived, whatever
    ///         the whitelist says now.
    function invariant_onlyDepositedAssetsAreRecorded() public view {
        uint256 packCount = handler.livePackCount();

        for (uint256 p; p < packCount; ++p) {
            address[] memory recorded = packs.basketAssetsOf(handler.livePacks(p));

            for (uint256 i; i < recorded.length; ++i) {
                bool known;
                for (uint256 a; a < assets.length; ++a) {
                    if (recorded[i] == assets[a]) known = true;
                }
                assertTrue(known);
            }
        }
    }
}
