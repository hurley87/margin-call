// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MockStockToken} from "./mocks/MockStockToken.sol";
import {PackCustody} from "../src/PackCustody.sol";
import {RipEngine} from "../src/RipEngine.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {RipEngineFixture} from "./helpers/RipEngineFixture.sol";

/// @notice Drives enroll / rip / claim / withdraw against the shared fixture stack.
contract RipEngineHandler is Test {
    uint256 internal constant WAD = 1e18;

    RipEngine public engine;
    PackCustody public packs;
    MockUSD public usd;
    address public admin;
    address public taker;
    address[] public makers;

    uint256 public ghostPaidIn;
    uint256 public ghostClaimedOut;
    uint256 public ghostProtocolOut;
    mapping(uint256 tokenId => bool everSettled) public ghostEverSettled;

    function configure(
        RipEngine engine_,
        PackCustody packs_,
        MockUSD usd_,
        address admin_,
        address taker_,
        address[] memory makers_
    ) external {
        engine = engine_;
        packs = packs_;
        usd = usd_;
        admin = admin_;
        taker = taker_;
        for (uint256 i; i < makers_.length; ++i) {
            makers.push(makers_[i]);
        }
    }

    function enroll(uint256 makerSeed, uint256 navSeed) external {
        address who = makers[bound(makerSeed, 0, makers.length - 1)];
        uint256 nav = bound(navSeed, 20 * WAD, 300 * WAD);
        nav = (nav / WAD) * WAD;
        if (nav < 20 * WAD) nav = 20 * WAD;
        if (nav > 300 * WAD) nav = 300 * WAD;

        uint256 amount = nav / 100;
        if (amount == 0) return;

        MockStockToken token = MockStockToken(packs.whitelistedAssets()[0]);
        if (token.balanceOf(who) < amount) {
            token.mint(who, amount * 10);
            vm.prank(who);
            token.approve(address(packs), type(uint256).max);
        }

        address[] memory assets = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        assets[0] = address(token);
        amounts[0] = amount;

        vm.prank(who);
        uint256 tokenId = packs.mint(assets, amounts);
        vm.prank(who);
        engine.enterPool(tokenId);
    }

    function rip(uint256 countSeed, uint256) external {
        if (engine.restingCount() < 2) return;
        (,, uint256 eligible) = engine.eligibleSnapshot();
        if (eligible < 2) return;

        uint256 maxCount = eligible - 1;
        if (maxCount > 5) maxCount = 5;
        uint256 count = bound(countSeed, 1, maxCount);

        try engine.quoteRip(count) returns (uint256, uint256, uint256, uint256 totalPayment) {
            if (usd.balanceOf(taker) < totalPayment) {
                vm.prank(admin);
                usd.mint(taker, totalPayment * 10);
            }
            vm.prank(taker);
            usd.approve(address(engine), type(uint256).max);

            vm.prank(taker);
            uint256[] memory drawn = engine.rip(count, totalPayment);
            ghostPaidIn += totalPayment;
            for (uint256 i; i < drawn.length; ++i) {
                assertFalse(ghostEverSettled[drawn[i]]);
                ghostEverSettled[drawn[i]] = true;
                assertFalse(engine.isResting(drawn[i]));
            }
        } catch {}
    }

    function claim(uint256 makerSeed) external {
        address who = makers[bound(makerSeed, 0, makers.length - 1)];
        uint256[] memory resting = engine.restingPackIds();
        if (resting.length == 0 && engine.claimableFees(who) == 0) return;

        uint256 before = usd.balanceOf(who);
        vm.prank(who);
        try engine.claim(resting) {
            ghostClaimedOut += usd.balanceOf(who) - before;
        } catch {
            uint256[] memory none = new uint256[](0);
            vm.prank(who);
            try engine.claim(none) returns (uint256 amt) {
                ghostClaimedOut += amt;
            } catch {}
        }
    }

    function withdrawProtocol() external {
        uint256 accrued = engine.protocolAccrued();
        if (accrued == 0) return;
        address treasury = makeAddr("invTreasury");
        uint256 before = usd.balanceOf(treasury);
        vm.prank(admin);
        try engine.withdrawProtocolFees(treasury) {
            ghostProtocolOut += usd.balanceOf(treasury) - before;
        } catch {}
    }
}

/// @notice Invariants compose `RipEngineFixture` instead of redeploying the stack.
contract RipEngineInvariantTest is Test, RipEngineFixture {
    RipEngineHandler internal handler;
    address internal maker3;

    function setUp() public override {
        super.setUp();
        maker3 = makeAddr("invMaker2");
        _fundMaker(maker3);

        address[] memory makers_ = new address[](3);
        makers_[0] = maker;
        makers_[1] = maker2;
        makers_[2] = maker3;

        handler = new RipEngineHandler();
        handler.configure(engine, packs, usd, admin, taker, makers_);

        bytes4[] memory selectors = new bytes4[](4);
        selectors[0] = RipEngineHandler.enroll.selector;
        selectors[1] = RipEngineHandler.rip.selector;
        selectors[2] = RipEngineHandler.claim.selector;
        selectors[3] = RipEngineHandler.withdrawProtocol.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    function invariant_solvency() public view {
        uint256 balance = usd.balanceOf(address(engine));
        uint256 claimable = engine.claimableFees(maker) + engine.claimableFees(maker2) + engine.claimableFees(maker3);

        uint256[] memory resting = engine.restingPackIds();
        uint256 pending;
        for (uint256 i; i < resting.length; ++i) {
            pending += engine.pendingOf(resting[i]);
        }

        assertGe(balance, claimable + pending + engine.protocolAccrued());
    }

    function invariant_conservation() public view {
        uint256 balance = usd.balanceOf(address(engine));
        assertEq(handler.ghostPaidIn(), balance + handler.ghostClaimedOut() + handler.ghostProtocolOut());
    }

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

    function invariant_settleOnce() public view {
        uint256[] memory ids = engine.restingPackIds();
        for (uint256 i; i < ids.length; ++i) {
            assertFalse(handler.ghostEverSettled(ids[i]));
        }
    }
}
