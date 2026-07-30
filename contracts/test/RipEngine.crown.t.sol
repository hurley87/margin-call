// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {RipEngine} from "../src/RipEngine.sol";
import {RipEngineFixture} from "./helpers/RipEngineFixture.sol";

contract RipEngineCrownTest is Test, RipEngineFixture {
    event PackNavCheckpointed(uint256 indexed tokenId, address indexed maker, uint256 previousNav, uint256 nav);
    event CrownTaken(address indexed maker, address indexed previousMaker, uint256 nav, uint256 previousNav);
    event CrownVacated(address indexed maker);
    event CrownPaid(address indexed maker, uint256 amount);

    /// @dev Per-unit settlement split, recomputed in the test rather than read from the engine.
    struct Split {
        uint256 unitStable;
        uint256 base;
        uint256 surchargeStable;
        uint256 protocolCut;
        uint256 crownCut;
        uint256 toMakers;
        uint256 totalPaid;
    }

    /// @param crownPaid Whether this Rip will carve a crown cut (post-purge, post-toggle).
    function _split(uint256 count, bool crownPaid) internal view returns (Split memory s) {
        (,,, s.totalPaid) = engine.quoteRip(count);
        s.unitStable = s.totalPaid / count;

        uint256 surcharge = registry.surcharge();
        s.base = (s.unitStable * WAD) / (WAD + surcharge);
        s.surchargeStable = s.unitStable - s.base;
        s.protocolCut = (s.surchargeStable * registry.protocolShareOfSurcharge()) / WAD;
        if (crownPaid) {
            s.crownCut = (s.surchargeStable * registry.crownShareOfSurcharge()) / WAD;
        }
        s.toMakers = s.unitStable - s.protocolCut - s.crownCut;
    }

    function _sumPending() internal view returns (uint256 pending) {
        uint256[] memory resting = engine.restingPackIds();
        for (uint256 i; i < resting.length; ++i) {
            pending += engine.pendingOf(resting[i]);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Toggle
    // ─────────────────────────────────────────────────────────────────────────

    function test_crown_offByDefault_tracksButDoesNotCarve() public {
        _enrollPackOf(maker, amzn, amznFeed, 50 * WAD);
        _enrollPackOf(maker, amzn, amznFeed, 50 * WAD);
        _enrollPackOf(maker2, amd, amdFeed, 90 * WAD);

        // Tracked while disabled, so flipping the lever crowns the standing leader immediately.
        assertFalse(registry.crownEnabled());
        assertEq(engine.crownedMaker(), maker);
        assertEq(engine.crownPayee(), address(0));

        Split memory s = _split(1, false);
        vm.prank(taker);
        engine.rip(1, s.totalPaid);

        assertEq(engine.claimableFees(maker), 0);
        assertEq(engine.protocolAccrued(), s.protocolCut);
        assertEq(engine.accFeePerPack(), s.toMakers / 2);
        assertEq(s.crownCut, 0);
    }

    function test_crown_enabledPaysStandingLeader() public {
        _enrollPackOf(maker, amzn, amznFeed, 50 * WAD);
        _enrollPackOf(maker2, amd, amdFeed, 40 * WAD);
        _enrollPackOf(maker2, nflx, nflxFeed, 40 * WAD);
        assertEq(engine.crownedMaker(), maker2);

        _enableCrown();
        assertEq(engine.crownPayee(), maker2);

        Split memory s = _split(1, true);
        assertGt(s.crownCut, 0);

        vm.prank(taker);
        engine.rip(1, s.totalPaid);

        assertEq(engine.claimableFees(maker2), s.crownCut);
        assertEq(engine.claimableFees(maker), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // crown_cut = crownShareOfSurcharge × surcharge, from the surcharge only
    // ─────────────────────────────────────────────────────────────────────────

    function test_crown_cutFromSurchargeOnly_makeWholePreserved() public {
        _enrollPackOf(maker, amzn, amznFeed, 50 * WAD);
        _enrollPackOf(maker, amzn, amznFeed, 50 * WAD);
        _enrollPackOf(maker2, amd, amdFeed, 90 * WAD);
        _enableCrown();
        assertEq(engine.crownPayee(), maker);

        Split memory s = _split(1, true);
        assertEq(s.crownCut, (s.surchargeStable * registry.crownShareOfSurcharge()) / WAD);
        assertLe(s.protocolCut + s.crownCut, s.surchargeStable);
        assertGe(s.toMakers, s.base);

        vm.prank(taker);
        engine.rip(1, s.totalPaid);

        assertEq(engine.protocolAccrued(), s.protocolCut);
        assertEq(engine.claimableFees(maker), s.crownCut);
        assertEq(engine.accFeePerPack(), s.toMakers / 2);
        assertEq(engine.feeDust(), s.toMakers % 2);
        // Conservation: every unit of the payment lands in exactly one bucket.
        assertEq(s.totalPaid, s.protocolCut + s.crownCut + s.toMakers);
    }

    function test_crown_combinedSharesAtOne_makersStillWhole() public {
        vm.startPrank(admin);
        registry.setCrownShareOfSurcharge(0);
        registry.setProtocolShareOfSurcharge(WAD / 4);
        registry.setCrownShareOfSurcharge((WAD * 3) / 4);
        registry.setCrownEnabled(true);
        vm.stopPrank();
        assertEq(registry.protocolShareOfSurcharge() + registry.crownShareOfSurcharge(), WAD);

        _enrollPackOf(maker, amzn, amznFeed, 60 * WAD);
        _enrollPackOf(maker2, amd, amdFeed, 40 * WAD);
        _enrollPackOf(maker2, nflx, nflxFeed, 40 * WAD);

        Split memory s = _split(1, true);
        // The whole surcharge is carved, so Makers land exactly on the base (± floor dust).
        assertGe(s.toMakers, s.base);
        assertLe(s.toMakers - s.base, 1);

        vm.prank(taker);
        engine.rip(1, s.totalPaid);

        assertEq(engine.protocolAccrued(), s.protocolCut);
        assertEq(engine.claimableFees(engine.crownPayee()), s.crownCut);
    }

    function test_crown_creditedFeeIsClaimable() public {
        _enrollPackOf(maker, amzn, amznFeed, 60 * WAD);
        _enrollPackOf(maker, amzn, amznFeed, 60 * WAD);
        _enrollPackOf(maker2, amd, amdFeed, 40 * WAD);
        _enableCrown();
        assertEq(engine.crownPayee(), maker);

        Split memory s = _split(1, true);
        vm.prank(taker);
        engine.rip(1, s.totalPaid);

        uint256 pending = _sumPending();
        uint256 expected = s.crownCut;
        uint256[] memory resting = engine.restingPackIds();
        for (uint256 i; i < resting.length; ++i) {
            if (engine.makerOf(resting[i]) == maker) expected += engine.pendingOf(resting[i]);
        }
        assertGt(pending, 0);

        uint256 before = usd.balanceOf(maker);
        vm.prank(maker);
        uint256 claimed = engine.claim(resting);
        assertEq(claimed, expected);
        assertEq(usd.balanceOf(maker), before + claimed);
    }

    function test_crown_vacantCarvesNothing() public {
        // Enrolling under a stale feed checkpoints NAV at zero, so nobody is crowned.
        vm.prank(admin);
        amznFeed.setUpdatedAt(block.timestamp - STALE_AFTER - 1);
        uint256 a = _enrollPackOf(maker, amzn, amznFeed, 50 * WAD);
        uint256 b = _enrollPackOf(maker2, amzn, amznFeed, 50 * WAD);
        assertEq(engine.navCheckpoint(a), 0);
        assertEq(engine.navCheckpoint(b), 0);
        assertEq(engine.crownedMaker(), address(0));

        // Feed recovers: both Packs are eligible again, but no Crown has been claimed.
        vm.prank(admin);
        amznFeed.setUpdatedAt(block.timestamp);
        _enableCrown();
        assertEq(engine.crownPayee(), address(0));

        Split memory s = _split(1, false);
        assertEq(s.crownCut, 0);

        vm.prank(taker);
        engine.rip(1, s.totalPaid);

        assertEq(engine.protocolAccrued(), s.protocolCut);
        assertEq(engine.accFeePerPack(), s.toMakers);
        assertEq(usd.balanceOf(address(engine)), s.totalPaid);
    }

    function testFuzz_crown_splitNeverCutsBase(uint256 surchargeSeed, uint256 protocolSeed, uint256 crownSeed) public {
        uint256 surcharge = bound(surchargeSeed, 0, WAD);
        uint256 protocolShare = bound(protocolSeed, 0, WAD);
        uint256 crownShare = bound(crownSeed, 0, WAD - protocolShare);

        vm.startPrank(admin);
        registry.setSurcharge(surcharge);
        registry.setCrownShareOfSurcharge(0);
        registry.setProtocolShareOfSurcharge(protocolShare);
        registry.setCrownShareOfSurcharge(crownShare);
        registry.setCrownEnabled(true);
        vm.stopPrank();

        _enrollPackOf(maker, amzn, amznFeed, 80 * WAD);
        _enrollPackOf(maker2, amd, amdFeed, 40 * WAD);
        _enrollPackOf(maker2, nflx, nflxFeed, 30 * WAD);

        Split memory s = _split(1, true);
        assertLe(s.protocolCut + s.crownCut, s.surchargeStable);
        assertGe(s.toMakers, s.base);

        vm.prank(taker);
        engine.rip(1, s.totalPaid);

        assertEq(engine.protocolAccrued(), s.protocolCut);
        assertEq(engine.claimableFees(engine.crownPayee()), s.crownCut);
        assertEq(s.totalPaid, s.protocolCut + s.crownCut + s.toMakers);
        assertEq(usd.balanceOf(address(engine)), s.totalPaid);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Crowned Maker = largest total resting NAV
    // ─────────────────────────────────────────────────────────────────────────

    function test_crown_totalsSumAcrossAMakersPacks() public {
        _enrollPackOf(maker, amzn, amznFeed, 50 * WAD);
        _enrollPackOf(maker, amzn, amznFeed, 50 * WAD);
        uint256 single = _enrollPackOf(maker2, amd, amdFeed, 90 * WAD);

        // The single largest Pack does not win — the largest total does.
        assertEq(engine.restingNavOf(maker), 100 * WAD);
        assertEq(engine.restingNavOf(maker2), 90 * WAD);
        assertEq(engine.navCheckpoint(single), 90 * WAD);
        assertEq(engine.crownedMaker(), maker);
    }

    function test_crown_firstEnrollmentTakesVacantCrown() public {
        assertEq(engine.crownedMaker(), address(0));
        assertEq(engine.crownThreshold(), 1);

        uint256 id = _mintPackOf(maker, amzn, amznFeed, 50 * WAD);
        vm.expectEmit(true, true, false, true, address(engine));
        emit CrownTaken(maker, address(0), 50 * WAD, 0);
        vm.prank(maker);
        engine.enterPool(id);

        assertEq(engine.crownedMaker(), maker);
        assertEq(engine.crownThreshold(), 55 * WAD);
    }

    function test_crown_beatMarginBlocksFlicker() public {
        _enrollPackOf(maker, amzn, amznFeed, 100 * WAD);
        assertEq(engine.crownedMaker(), maker);
        assertEq(engine.crownThreshold(), 110 * WAD);

        // 105 > 100 but short of the 10% beat margin.
        uint256 challengerPack = _enrollPackOf(maker2, amd, amdFeed, 105 * WAD);
        assertEq(engine.restingNavOf(maker2), 105 * WAD);
        assertEq(engine.crownedMaker(), maker);
        assertFalse(engine.challengeCrown(maker2));

        // Top up to exactly the threshold, register it, and the Crown moves.
        _topUpPackBy(maker2, challengerPack, amd, amdFeed, 5 * WAD);
        vm.expectEmit(true, true, false, true, address(engine));
        emit CrownTaken(maker2, maker, 110 * WAD, 100 * WAD);
        engine.syncPackNav(challengerPack);

        assertEq(engine.crownedMaker(), maker2);
        assertEq(engine.restingNavOf(maker2), 110 * WAD);
    }

    function test_crown_zeroBeatMarginStillNeedsAStrictBeat() public {
        vm.prank(admin);
        registry.setCrownBeatMargin(0);

        _enrollPackOf(maker, amzn, amznFeed, 100 * WAD);
        assertEq(engine.crownThreshold(), 100 * WAD + 1);

        // An exact tie is not a beat.
        _enrollPackOf(maker2, amd, amdFeed, 100 * WAD);
        assertEq(engine.crownedMaker(), maker);

        _enrollPackOf(maker2, nflx, nflxFeed, 20 * WAD);
        assertEq(engine.crownedMaker(), maker2);
    }

    function test_challengeCrown_isPermissionlessAndIdempotent() public {
        _enrollPackOf(maker, amzn, amznFeed, 100 * WAD);
        _enrollPackOf(maker2, amd, amdFeed, 105 * WAD);

        vm.prank(stranger);
        assertFalse(engine.challengeCrown(maker2));

        _topUpPackBy(maker2, engine.restingPackIds()[1], amd, amdFeed, 10 * WAD);
        engine.syncPackNav(engine.restingPackIds()[1]);
        assertEq(engine.crownedMaker(), maker2);

        // Re-challenging the reigning Maker is a no-op, not a re-coronation.
        vm.prank(stranger);
        assertFalse(engine.challengeCrown(maker2));
        assertFalse(engine.challengeCrown(address(0)));
        assertFalse(engine.challengeCrown(stranger));
        assertEq(engine.crownedMaker(), maker2);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Recompute: create / top-up / delist / draw-out
    // ─────────────────────────────────────────────────────────────────────────

    function test_crown_recomputedOnTopUpSync() public {
        uint256 leaderPack = _enrollPackOf(maker, amzn, amznFeed, 100 * WAD);
        uint256 challengerPack = _enrollPackOf(maker2, amd, amdFeed, 50 * WAD);
        assertEq(engine.crownedMaker(), maker);

        // A top-up alone does not move the Crown — custody has no hook into the engine.
        _topUpPackBy(maker2, challengerPack, amd, amdFeed, 80 * WAD);
        assertEq(engine.restingNavOf(maker2), 50 * WAD);
        assertEq(engine.crownedMaker(), maker);

        vm.expectEmit(true, true, false, true, address(engine));
        emit PackNavCheckpointed(challengerPack, maker2, 50 * WAD, 130 * WAD);
        uint256 nav = engine.syncPackNav(challengerPack);

        assertEq(nav, 130 * WAD);
        assertEq(engine.crownedMaker(), maker2);
        assertEq(engine.restingNavOf(maker), 100 * WAD);
        assertEq(engine.navCheckpoint(leaderPack), 100 * WAD);
    }

    function test_crown_syncDownwardKeepsCrownUntilChallenged() public {
        uint256 leaderPack = _enrollPackOf(maker, amzn, amznFeed, 200 * WAD);
        _enrollPackOf(maker2, amd, amdFeed, 150 * WAD);
        assertEq(engine.crownedMaker(), maker);

        // Leader's holdings halve in value; the Crown does not flicker on the way down.
        vm.prank(admin);
        amznFeed.setPrice(50e8);
        engine.syncPackNav(leaderPack);
        assertEq(engine.restingNavOf(maker), 100 * WAD);
        assertEq(engine.crownedMaker(), maker);

        // The challenger now clears the margin, but only an explicit challenge moves it.
        assertEq(engine.crownThreshold(), 110 * WAD);
        assertTrue(engine.challengeCrown(maker2));
        assertEq(engine.crownedMaker(), maker2);
    }

    function test_crown_recomputedOnDelistExit() public {
        uint256 leaderPack = _enrollPackOf(maker, amzn, amznFeed, 100 * WAD);
        _enrollPackOf(maker2, amd, amdFeed, 40 * WAD);
        assertEq(engine.crownedMaker(), maker);

        vm.prank(maker);
        engine.exitPool(leaderPack);

        assertEq(engine.restingNavOf(maker), 0);
        assertEq(engine.navCheckpoint(leaderPack), 0);
        assertEq(engine.crownedMaker(), address(0));
        assertEq(engine.crownThreshold(), 1);

        // Vacant Crown is up for grabs by anyone with something resting.
        assertTrue(engine.challengeCrown(maker2));
        assertEq(engine.crownedMaker(), maker2);
    }

    function test_crown_partialExitKeepsCrown() public {
        uint256 a = _enrollPackOf(maker, amzn, amznFeed, 60 * WAD);
        _enrollPackOf(maker, amzn, amznFeed, 60 * WAD);
        _enrollPackOf(maker2, amd, amdFeed, 40 * WAD);

        vm.prank(maker);
        engine.exitPool(a);

        assertEq(engine.restingNavOf(maker), 60 * WAD);
        assertEq(engine.crownedMaker(), maker);
    }

    function test_crown_vacatedOnDelistEmitsEvent() public {
        uint256 leaderPack = _enrollPackOf(maker, amzn, amznFeed, 100 * WAD);

        vm.expectEmit(true, false, false, false, address(engine));
        emit CrownVacated(maker);
        vm.prank(maker);
        engine.exitPool(leaderPack);
    }

    function test_crown_ghostLeaderPurgedBeforeCarve() public {
        uint256 ghost = _enrollPackOf(maker, amzn, amznFeed, 200 * WAD);
        _enrollPackOf(maker2, amd, amdFeed, 40 * WAD);
        _enrollPackOf(maker2, nflx, nflxFeed, 40 * WAD);
        _enableCrown();
        assertEq(engine.crownPayee(), maker);

        // Leader redeems out of custody but stays enrolled until the next Rip purges them.
        vm.prank(maker);
        packs.delistAndRedeem(ghost);
        assertTrue(engine.isResting(ghost));
        assertEq(engine.crownedMaker(), maker);

        // The purge runs before pricing, so the ghost leader is not paid a crown cut.
        Split memory s = _split(1, false);
        vm.prank(taker);
        engine.rip(1, s.totalPaid);

        assertFalse(engine.isResting(ghost));
        assertEq(engine.claimableFees(maker), 0);
        assertEq(engine.protocolAccrued(), s.protocolCut);
        assertEq(engine.accFeePerPack(), s.toMakers);
        // Purging the ghost vacated the Crown mid-Rip; the drawn Pack's Maker then re-challenged
        // against a vacant Crown and picked it up.
        assertEq(engine.restingNavOf(maker), 0);
        assertEq(engine.crownedMaker(), maker2);
    }

    function test_crown_recomputedOnDrawOut() public {
        _enrollPackOf(maker, amzn, amznFeed, 50 * WAD);
        _enrollPackOf(maker, amzn, amznFeed, 50 * WAD);
        _enrollPackOf(maker2, amd, amdFeed, 40 * WAD);
        _enableCrown();
        assertEq(engine.crownPayee(), maker);

        Split memory s = _split(2, true);
        vm.prank(taker);
        engine.rip(2, s.totalPaid);

        // Whatever the draw took, the Crown follows the checkpointed totals.
        assertEq(engine.restingCount(), 1);
        if (engine.restingNavOf(maker) > 0) {
            assertEq(engine.crownedMaker(), maker);
        } else {
            assertEq(engine.crownedMaker(), address(0));
            assertTrue(engine.challengeCrown(maker2));
            assertEq(engine.crownedMaker(), maker2);
        }

        uint256[] memory resting = engine.restingPackIds();
        address survivor = engine.makerOf(resting[0]);
        assertEq(engine.restingNavOf(survivor), engine.navCheckpoint(resting[0]));
    }

    function test_crown_paidToTheLeaderAtRipTimeEvenIfDrawnOut() public {
        _enrollPackOf(maker, amzn, amznFeed, 100 * WAD);
        _enrollPackOf(maker2, amd, amdFeed, 40 * WAD);
        _enrollPackOf(maker2, nflx, nflxFeed, 40 * WAD);
        _enableCrown();
        assertEq(engine.crownPayee(), maker);

        Split memory s = _split(2, true);
        uint256 crownCutTotal = s.crownCut * 2;

        vm.expectEmit(true, false, false, true, address(engine));
        emit CrownPaid(maker, crownCutTotal);
        vm.prank(taker);
        engine.rip(2, s.totalPaid);

        assertGe(engine.claimableFees(maker), crownCutTotal);
        assertEq(engine.protocolAccrued(), s.protocolCut * 2);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NAV checkpoints
    // ─────────────────────────────────────────────────────────────────────────

    function test_syncPackNav_failsClosedOnStaleFeed() public {
        uint256 id = _enrollPackOf(maker, amzn, amznFeed, 100 * WAD);
        assertEq(engine.navCheckpoint(id), 100 * WAD);

        vm.prank(admin);
        amznFeed.setUpdatedAt(block.timestamp - STALE_AFTER - 1);

        // A feed gap must not let anyone zero out a Maker's total and knock them off the Crown.
        vm.expectRevert(abi.encodeWithSelector(RipEngine.NavUnavailable.selector, id));
        engine.syncPackNav(id);

        assertEq(engine.navCheckpoint(id), 100 * WAD);
        assertEq(engine.restingNavOf(maker), 100 * WAD);
        assertEq(engine.crownedMaker(), maker);
    }

    function test_syncPackNav_notRestingReverts() public {
        uint256 id = _mintPackOf(maker, amzn, amznFeed, 100 * WAD);
        vm.expectRevert(abi.encodeWithSelector(RipEngine.PackNotResting.selector, id));
        engine.syncPackNav(id);
    }

    function test_enterPool_unreadableNavCheckpointsZeroThenSyncs() public {
        vm.prank(admin);
        amznFeed.setPaused(true);

        uint256 id = _enrollPackOf(maker, amzn, amznFeed, 100 * WAD);
        assertEq(engine.navCheckpoint(id), 0);
        assertEq(engine.restingNavOf(maker), 0);
        assertEq(engine.crownedMaker(), address(0));

        vm.prank(admin);
        amznFeed.setPaused(false);
        assertEq(engine.syncPackNav(id), 100 * WAD);
        assertEq(engine.crownedMaker(), maker);
    }

    function test_crown_countsRestingPacksOutsideTheBand() public {
        // Fee accrual follows enrollment rather than per-Rip eligibility, and so do Crown totals.
        uint256 dusty = _enrollPackOf(maker, amzn, amznFeed, 10 * WAD);
        assertFalse(registry.isNavInBand(10 * WAD));
        assertEq(engine.navCheckpoint(dusty), 10 * WAD);
        assertEq(engine.restingNavOf(maker), 10 * WAD);
        assertEq(engine.crownedMaker(), maker);
    }
}
