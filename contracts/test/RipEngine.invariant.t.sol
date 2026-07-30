// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MockStockToken} from "./mocks/MockStockToken.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {PackCustody} from "../src/PackCustody.sol";
import {RipEngine} from "../src/RipEngine.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {RipEngineFixture} from "./helpers/RipEngineFixture.sol";

/// @notice Drives enroll / rip / claim / withdraw / crown against the shared fixture stack.
contract RipEngineHandler is Test {
    uint256 internal constant WAD = 1e18;

    RipEngine public engine;
    AssetRegistry public registry;
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
        AssetRegistry registry_,
        PackCustody packs_,
        MockUSD usd_,
        address admin_,
        address taker_,
        address[] memory makers_
    ) external {
        engine = engine_;
        registry = registry_;
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

    function toggleCrown(uint256 seed) external {
        vm.prank(admin);
        registry.setCrownEnabled(seed % 2 == 0);
    }

    function syncNav(uint256 seed) external {
        uint256[] memory resting = engine.restingPackIds();
        if (resting.length == 0) return;
        engine.syncPackNav(resting[bound(seed, 0, resting.length - 1)]);
    }

    function challengeCrown(uint256 makerSeed) external {
        engine.challengeCrown(makers[bound(makerSeed, 0, makers.length - 1)]);
    }

    function topUp(uint256 tokenSeed, uint256 navSeed) external {
        uint256[] memory resting = engine.restingPackIds();
        if (resting.length == 0) return;

        uint256 tokenId = resting[bound(tokenSeed, 0, resting.length - 1)];
        if (!packs.isListed(tokenId)) return;

        address who = packs.creatorOf(tokenId);
        MockStockToken token = MockStockToken(packs.whitelistedAssets()[0]);
        uint256 amount = bound(navSeed, 1, 50) * (10 ** uint256(token.decimals())) / 100;
        if (amount == 0) return;

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
        packs.topUp(tokenId, assets, amounts);
        engine.syncPackNav(tokenId);
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
        handler.configure(engine, registry, packs, usd, admin, taker, makers_);

        bytes4[] memory selectors = new bytes4[](8);
        selectors[0] = RipEngineHandler.enroll.selector;
        selectors[1] = RipEngineHandler.rip.selector;
        selectors[2] = RipEngineHandler.claim.selector;
        selectors[3] = RipEngineHandler.withdrawProtocol.selector;
        selectors[4] = RipEngineHandler.toggleCrown.selector;
        selectors[5] = RipEngineHandler.syncNav.selector;
        selectors[6] = RipEngineHandler.challengeCrown.selector;
        selectors[7] = RipEngineHandler.topUp.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    function _makers() internal view returns (address[3] memory) {
        return [maker, maker2, maker3];
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

    /// @dev A Maker with nothing resting can never hold the Crown.
    function invariant_crownedMakerIsResting() public view {
        address crowned = engine.crownedMaker();
        if (crowned == address(0)) return;
        assertGt(engine.restingNavOf(crowned), 0);
    }

    /// @dev `restingNavOf` stays the exact sum of the Maker's resting Pack checkpoints.
    function invariant_restingNavTotalsMatchCheckpoints() public view {
        uint256[] memory ids = engine.restingPackIds();
        address[3] memory makers_ = _makers();

        uint256 attributed;
        for (uint256 m; m < makers_.length; ++m) {
            uint256 sum;
            for (uint256 i; i < ids.length; ++i) {
                if (engine.makerOf(ids[i]) == makers_[m]) sum += engine.navCheckpoint(ids[i]);
            }
            assertEq(engine.restingNavOf(makers_[m]), sum);
            attributed += sum;
        }

        uint256 total;
        for (uint256 i; i < ids.length; ++i) {
            total += engine.navCheckpoint(ids[i]);
        }
        assertEq(attributed, total);
    }

    /// @dev Once every Maker has challenged, the Crown sits with a total no one else can beat,
    ///      and is vacant only when nothing is resting. Probes on a snapshot so the campaign
    ///      state is untouched.
    function invariant_crownSettlesOnTheLargestTotal() public {
        uint256 snapshot = vm.snapshotState();

        address[3] memory makers_ = _makers();
        for (uint256 m; m < makers_.length; ++m) {
            engine.challengeCrown(makers_[m]);
        }

        address crowned = engine.crownedMaker();
        if (crowned == address(0)) {
            for (uint256 m; m < makers_.length; ++m) {
                assertEq(engine.restingNavOf(makers_[m]), 0);
            }
        } else {
            uint256 threshold = engine.crownThreshold();
            for (uint256 m; m < makers_.length; ++m) {
                if (makers_[m] == crowned) continue;
                assertLt(engine.restingNavOf(makers_[m]), threshold);
            }
        }

        vm.revertToState(snapshot);
    }
}
