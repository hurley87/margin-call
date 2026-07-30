// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {AssetRegistry} from "../../src/AssetRegistry.sol";
import {MockUSD} from "../../src/MockUSD.sol";
import {PackCustody} from "../../src/PackCustody.sol";
import {RipEngine} from "../../src/RipEngine.sol";
import {MockPriceFeed} from "../../src/mocks/MockPriceFeed.sol";
import {MockRandomness} from "../../src/mocks/MockRandomness.sol";
import {MockStockToken} from "../mocks/MockStockToken.sol";

/// @notice Wired PackCustody + AssetRegistry + MockUSD + RipEngine for game-loop tests.
/// @dev Does not inherit `Test` so invariant suites can mix this with `StdInvariant`.
abstract contract RipEngineFixture {
    Vm private constant _vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 internal constant WAD = 1e18;
    uint8 internal constant FEED_DECIMALS = 8;
    uint64 internal constant STALE_AFTER = 1 hours;

    PackCustody internal packs;
    AssetRegistry internal registry;
    MockUSD internal usd;
    MockRandomness internal randomness;
    RipEngine internal engine;

    MockStockToken internal amzn;
    MockStockToken internal amd;
    MockStockToken internal nflx;
    MockStockToken internal pltr;
    MockStockToken internal tsla;

    MockPriceFeed internal amznFeed;
    MockPriceFeed internal amdFeed;
    MockPriceFeed internal nflxFeed;
    MockPriceFeed internal pltrFeed;
    MockPriceFeed internal tslaFeed;

    // Deterministic labels matching forge-std `makeAddr`.
    address internal admin = address(uint160(uint256(keccak256(abi.encodePacked("admin")))));
    address internal maker = address(uint160(uint256(keccak256(abi.encodePacked("maker")))));
    address internal maker2 = address(uint160(uint256(keccak256(abi.encodePacked("maker2")))));
    address internal taker = address(uint160(uint256(keccak256(abi.encodePacked("taker")))));
    address internal stranger = address(uint160(uint256(keccak256(abi.encodePacked("stranger")))));

    function setUp() public virtual {
        _vm.label(admin, "admin");
        _vm.label(maker, "maker");
        _vm.label(maker2, "maker2");
        _vm.label(taker, "taker");
        _vm.label(stranger, "stranger");

        amzn = new MockStockToken("Amazon Test Stock", "tAMZN", 18);
        amd = new MockStockToken("AMD Test Stock", "tAMD", 18);
        nflx = new MockStockToken("Netflix Test Stock", "tNFLX", 8);
        pltr = new MockStockToken("Palantir Test Stock", "tPLTR", 6);
        tsla = new MockStockToken("Tesla Test Stock", "tTSLA", 18);

        address[] memory whitelist = new address[](5);
        whitelist[0] = address(amzn);
        whitelist[1] = address(amd);
        whitelist[2] = address(nflx);
        whitelist[3] = address(pltr);
        whitelist[4] = address(tsla);

        packs = new PackCustody(admin, whitelist);
        registry = new AssetRegistry(admin);
        usd = new MockUSD(admin);
        randomness = new MockRandomness(admin, 0xC0FFEE);

        amznFeed = new MockPriceFeed(admin, FEED_DECIMALS, 100e8);
        amdFeed = new MockPriceFeed(admin, FEED_DECIMALS, 50e8);
        nflxFeed = new MockPriceFeed(admin, FEED_DECIMALS, 200e8);
        pltrFeed = new MockPriceFeed(admin, FEED_DECIMALS, 25e8);
        tslaFeed = new MockPriceFeed(admin, FEED_DECIMALS, 300e8);

        _vm.startPrank(admin);
        registry.addAsset(address(amzn), address(amznFeed), STALE_AFTER);
        registry.addAsset(address(amd), address(amdFeed), STALE_AFTER);
        registry.addAsset(address(nflx), address(nflxFeed), STALE_AFTER);
        registry.addAsset(address(pltr), address(pltrFeed), STALE_AFTER);
        registry.addAsset(address(tsla), address(tslaFeed), STALE_AFTER);
        usd.grantRole(usd.MINTER_ROLE(), admin);
        _vm.stopPrank();

        engine = new RipEngine(admin, address(packs), address(registry), address(usd), address(randomness));

        bytes32 ripRole = packs.RIP_ENGINE_ROLE();
        _vm.prank(admin);
        packs.grantRole(ripRole, address(engine));

        _fundMaker(maker);
        _fundMaker(maker2);
        _fundTaker(taker);
    }

    function _fundMaker(address who) internal {
        MockStockToken[5] memory tokens = [amzn, amd, nflx, pltr, tsla];
        for (uint256 i; i < tokens.length; ++i) {
            uint256 amount = 1_000_000 * (10 ** tokens[i].decimals());
            tokens[i].mint(who, amount);
            _vm.prank(who);
            tokens[i].approve(address(packs), type(uint256).max);
        }
    }

    function _fundTaker(address who) internal {
        _vm.prank(admin);
        usd.mint(who, 1_000_000e6);
        _vm.prank(who);
        usd.approve(address(engine), type(uint256).max);
    }

    function _mintPackAtNav(address who, uint256 navWad) internal returns (uint256 tokenId) {
        uint256 amount = navWad / 100;
        address[] memory assets = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        assets[0] = address(amzn);
        amounts[0] = amount;
        _vm.prank(who);
        tokenId = packs.mint(assets, amounts);
    }

    function _enrollPack(address who, uint256 navWad) internal returns (uint256 tokenId) {
        tokenId = _mintPackAtNav(who, navWad);
        _vm.prank(who);
        engine.enterPool(tokenId);
    }

    function _enrollMany(address who, uint256 n, uint256 navWad) internal returns (uint256[] memory ids) {
        ids = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            ids[i] = _enrollPack(who, navWad);
        }
    }
}
