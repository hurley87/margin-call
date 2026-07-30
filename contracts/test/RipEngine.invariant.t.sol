// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {PackCustody} from "../src/PackCustody.sol";
import {RipEngine} from "../src/RipEngine.sol";
import {MockPriceFeed} from "../src/mocks/MockPriceFeed.sol";
import {MockRandomness} from "../src/mocks/MockRandomness.sol";
import {MockStockToken} from "./mocks/MockStockToken.sol";

/// @notice Drives enroll / rip / claim through the public ABI and tracks fee ghosts.
contract RipEngineHandler is Test {
    uint256 internal constant WAD = 1e18;

    RipEngine public immutable ENGINE;
    PackCustody public immutable PACKS;
    MockUSD public immutable USD;
    address public immutable ADMIN;

    address[] public makers;
    address public taker;

    uint256 public ghostPaidIn;
    uint256 public ghostClaimedOut;
    uint256 public ghostProtocolOut;
    mapping(uint256 tokenId => bool everResting) public ghostEverResting;
    mapping(uint256 tokenId => bool everSettled) public ghostEverSettled;

    constructor(RipEngine engine_, PackCustody packs_, MockUSD usd_, address admin_, address taker_) {
        ENGINE = engine_;
        PACKS = packs_;
        USD = usd_;
        ADMIN = admin_;
        taker = taker_;

        makers.push(makeAddr("invMaker0"));
        makers.push(makeAddr("invMaker1"));
        makers.push(makeAddr("invMaker2"));
    }

    function enroll(uint256 makerSeed, uint256 navSeed) external {
        address maker = makers[bound(makerSeed, 0, makers.length - 1)];
        uint256 nav = bound(navSeed, 20 * WAD, 300 * WAD);
        nav = (nav / WAD) * WAD;
        if (nav < 20 * WAD) nav = 20 * WAD;
        if (nav > 300 * WAD) nav = 300 * WAD;

        uint256 amount = nav / 100;
        if (amount == 0) return;

        MockStockToken amzn = MockStockToken(PACKS.whitelistedAssets()[0]);
        if (amzn.balanceOf(maker) < amount) {
            amzn.mint(maker, amount * 10);
            vm.prank(maker);
            amzn.approve(address(PACKS), type(uint256).max);
        }

        address[] memory assets = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        assets[0] = address(amzn);
        amounts[0] = amount;

        vm.prank(maker);
        uint256 tokenId = PACKS.mint(assets, amounts);
        vm.prank(maker);
        ENGINE.enterPool(tokenId);

        ghostEverResting[tokenId] = true;
    }

    function rip(uint256 countSeed, uint256) external {
        uint256 resting = ENGINE.restingCount();
        if (resting < 2) return;

        (,, uint256 eligible) = ENGINE.eligibleSnapshot();
        if (eligible < 2) return;

        uint256 maxCount = eligible - 1;
        if (maxCount > 5) maxCount = 5;
        uint256 count = bound(countSeed, 1, maxCount);

        try ENGINE.quoteRip(count) returns (uint256, uint256, uint256, uint256 totalPayment) {
            if (USD.balanceOf(taker) < totalPayment) {
                vm.prank(ADMIN);
                USD.mint(taker, totalPayment * 10);
            }
            vm.prank(taker);
            USD.approve(address(ENGINE), type(uint256).max);

            vm.prank(taker);
            uint256[] memory drawn = ENGINE.rip(count, totalPayment);
            ghostPaidIn += totalPayment;
            for (uint256 i; i < drawn.length; ++i) {
                assertFalse(ghostEverSettled[drawn[i]]);
                ghostEverSettled[drawn[i]] = true;
                assertFalse(ENGINE.isResting(drawn[i]));
            }
        } catch {}
    }

    function claim(uint256 makerSeed) external {
        address maker = makers[bound(makerSeed, 0, makers.length - 1)];
        uint256[] memory resting = ENGINE.restingPackIds();
        if (resting.length == 0 && ENGINE.claimableFees(maker) == 0) return;

        uint256 before = USD.balanceOf(maker);
        vm.prank(maker);
        try ENGINE.claimFees(resting) {
            ghostClaimedOut += USD.balanceOf(maker) - before;
        } catch {
            vm.prank(maker);
            try ENGINE.claim() returns (uint256 amt) {
                ghostClaimedOut += amt;
            } catch {}
        }
    }

    function withdrawProtocol() external {
        uint256 accrued = ENGINE.protocolAccrued();
        if (accrued == 0) return;
        address treasury = makeAddr("invTreasury");
        uint256 before = USD.balanceOf(treasury);
        vm.prank(ADMIN);
        try ENGINE.withdrawProtocolFees(treasury) {
            ghostProtocolOut += USD.balanceOf(treasury) - before;
        } catch {}
    }
}

contract RipEngineInvariantTest is StdInvariant, Test {
    uint8 internal constant FEED_DECIMALS = 8;
    uint64 internal constant STALE_AFTER = 1 hours;

    RipEngineHandler internal handler;
    RipEngine internal engine;
    PackCustody internal packs;
    MockUSD internal usd;

    address internal admin = makeAddr("admin");
    address internal taker = makeAddr("taker");
    address internal maker0 = makeAddr("invMaker0");
    address internal maker1 = makeAddr("invMaker1");
    address internal maker2 = makeAddr("invMaker2");

    function setUp() public {
        MockStockToken amzn = new MockStockToken("Amazon", "tAMZN", 18);
        MockStockToken amd = new MockStockToken("AMD", "tAMD", 18);
        MockStockToken nflx = new MockStockToken("NFLX", "tNFLX", 8);
        MockStockToken pltr = new MockStockToken("PLTR", "tPLTR", 6);
        MockStockToken tsla = new MockStockToken("TSLA", "tTSLA", 18);

        address[] memory whitelist = new address[](5);
        whitelist[0] = address(amzn);
        whitelist[1] = address(amd);
        whitelist[2] = address(nflx);
        whitelist[3] = address(pltr);
        whitelist[4] = address(tsla);

        packs = new PackCustody(admin, whitelist);
        AssetRegistry registry = new AssetRegistry(admin);
        usd = new MockUSD(admin);
        MockRandomness randomness = new MockRandomness(admin, 1);

        MockPriceFeed amznFeed = new MockPriceFeed(admin, FEED_DECIMALS, 100e8);
        MockPriceFeed amdFeed = new MockPriceFeed(admin, FEED_DECIMALS, 50e8);
        MockPriceFeed nflxFeed = new MockPriceFeed(admin, FEED_DECIMALS, 200e8);
        MockPriceFeed pltrFeed = new MockPriceFeed(admin, FEED_DECIMALS, 25e8);
        MockPriceFeed tslaFeed = new MockPriceFeed(admin, FEED_DECIMALS, 300e8);

        vm.startPrank(admin);
        registry.addAsset(address(amzn), address(amznFeed), STALE_AFTER);
        registry.addAsset(address(amd), address(amdFeed), STALE_AFTER);
        registry.addAsset(address(nflx), address(nflxFeed), STALE_AFTER);
        registry.addAsset(address(pltr), address(pltrFeed), STALE_AFTER);
        registry.addAsset(address(tsla), address(tslaFeed), STALE_AFTER);
        usd.grantRole(usd.MINTER_ROLE(), admin);
        vm.stopPrank();

        engine = new RipEngine(admin, address(packs), address(registry), address(usd), address(randomness));
        bytes32 ripRole = packs.RIP_ENGINE_ROLE();
        vm.prank(admin);
        packs.grantRole(ripRole, address(engine));

        address[3] memory makerAddrs = [maker0, maker1, maker2];
        for (uint256 i; i < makerAddrs.length; ++i) {
            amzn.mint(makerAddrs[i], 1_000_000e18);
            vm.prank(makerAddrs[i]);
            amzn.approve(address(packs), type(uint256).max);
        }
        vm.prank(admin);
        usd.mint(taker, 10_000_000e6);
        vm.prank(taker);
        usd.approve(address(engine), type(uint256).max);

        handler = new RipEngineHandler(engine, packs, usd, admin, taker);
        targetContract(address(handler));
    }

    /// @notice Engine stablecoin balance covers unclaimed maker fees + protocol.
    function invariant_solvency() public view {
        uint256 balance = usd.balanceOf(address(engine));
        uint256 claimable = engine.claimableFees(maker0) + engine.claimableFees(maker1) + engine.claimableFees(maker2);

        uint256[] memory resting = engine.restingPackIds();
        uint256 pending;
        for (uint256 i; i < resting.length; ++i) {
            pending += engine.pendingOf(resting[i]);
        }

        assertGe(balance, claimable + pending + engine.protocolAccrued());
    }

    /// @notice Payments in equal remaining balance + claims + protocol withdrawals.
    function invariant_conservation() public view {
        uint256 balance = usd.balanceOf(address(engine));
        assertEq(handler.ghostPaidIn(), balance + handler.ghostClaimedOut() + handler.ghostProtocolOut());
    }

    /// @notice No Pack is enrolled twice.
    function invariant_noDoubleEnrollment() public view {
        uint256[] memory ids = engine.restingPackIds();
        assertEq(ids.length, engine.restingCount());
        for (uint256 i; i < ids.length; ++i) {
            assertTrue(engine.isResting(ids[i]));
            for (uint256 j; j < i; ++j) {
                assertTrue(ids[i] != ids[j]);
            }
        }
    }

    /// @notice A settled Pack never returns to the resting set.
    function invariant_settleOnce() public view {
        uint256[] memory ids = engine.restingPackIds();
        for (uint256 i; i < ids.length; ++i) {
            assertFalse(handler.ghostEverSettled(ids[i]));
        }
    }
}
