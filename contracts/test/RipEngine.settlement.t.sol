// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {RipEngine} from "../src/RipEngine.sol";
import {RipEngineFixture} from "./helpers/RipEngineFixture.sol";

contract RipEngineSettlementTest is Test, RipEngineFixture {
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

    function test_rip_transfersPackToTaker() public {
        uint256 a = _enrollPack(maker, 30 * WAD);
        uint256 b = _enrollPack(maker2, 40 * WAD);
        assertTrue(engine.isResting(a));
        assertTrue(engine.isResting(b));

        uint256 balBefore = usd.balanceOf(taker);
        (,,, uint256 totalPayment) = engine.quoteRip(1);

        vm.prank(taker);
        uint256[] memory drawn = engine.rip(1, totalPayment);

        assertEq(drawn.length, 1);
        assertEq(packs.ownerOf(drawn[0]), taker);
        assertFalse(packs.isListed(drawn[0]));
        assertFalse(engine.isResting(drawn[0]));
        assertEq(engine.restingCount(), 1);
        assertEq(usd.balanceOf(taker), balBefore - totalPayment);
    }

    function test_rip_batchDistinctWithoutReplacement() public {
        _enrollMany(maker, 5, 50 * WAD);

        (,,, uint256 totalPayment) = engine.quoteRip(3);
        vm.prank(taker);
        uint256[] memory drawn = engine.rip(3, totalPayment);

        assertEq(drawn.length, 3);
        for (uint256 i; i < 3; ++i) {
            assertEq(packs.ownerOf(drawn[i]), taker);
            for (uint256 j; j < i; ++j) {
                assertTrue(drawn[i] != drawn[j]);
            }
        }
        assertEq(engine.restingCount(), 2);
    }

    function test_rip_slippageReverts() public {
        _enrollMany(maker, 3, 50 * WAD);
        (,,, uint256 totalPayment) = engine.quoteRip(1);

        vm.expectRevert(abi.encodeWithSelector(RipEngine.SlippageExceeded.selector, totalPayment, totalPayment - 1));
        vm.prank(taker);
        engine.rip(1, totalPayment - 1);
    }

    function test_rip_protocolCutFromSurchargeOnly() public {
        _enrollMany(maker, 3, 50 * WAD);

        (,, uint256 unitPriceWad, uint256 totalPayment) = engine.quoteRip(1);
        uint256 unitStable = totalPayment; // count=1
        uint256 surcharge = registry.surcharge();
        uint256 baseStable = (unitStable * WAD) / (WAD + surcharge);
        uint256 surStable = unitStable - baseStable;
        uint256 expectedProtocol = (surStable * registry.protocolShareOfSurcharge()) / WAD;
        uint256 expectedToMakers = unitStable - expectedProtocol;

        // Make-whole: toMakers >= base
        assertGe(expectedToMakers, baseStable);

        vm.prank(taker);
        engine.rip(1, totalPayment);

        assertEq(engine.protocolAccrued(), expectedProtocol);
        // Two packs remain; fee index bumps by toMakers/2 (+dust).
        uint256 remaining = 2;
        uint256 perPack = expectedToMakers / remaining;
        assertEq(engine.accFeePerPack(), perPack);
        assertEq(engine.feeDust(), expectedToMakers % remaining);
        // Silence unused
        unitPriceWad;
    }

    function test_rip_drawnPackStopsAccruing() public {
        uint256 a = _enrollPack(maker, 30 * WAD);
        uint256 b = _enrollPack(maker2, 40 * WAD);
        uint256 c = _enrollPack(maker, 50 * WAD);

        (,,, uint256 pay1) = engine.quoteRip(1);
        vm.prank(taker);
        uint256[] memory drawn = engine.rip(1, pay1);
        uint256 ripped = drawn[0];
        uint256 accAfterFirst = engine.accFeePerPack();

        // Second rip — ripped pack must not be resting / accruing.
        assertFalse(engine.isResting(ripped));
        (,,, uint256 pay2) = engine.quoteRip(1);
        vm.prank(taker);
        engine.rip(1, pay2);

        assertEq(engine.pendingOf(ripped), 0);
        assertGt(engine.accFeePerPack(), accAfterFirst);
        // One of a/b/c still resting
        uint256 restingLeft = 0;
        if (engine.isResting(a)) restingLeft++;
        if (engine.isResting(b)) restingLeft++;
        if (engine.isResting(c)) restingLeft++;
        assertEq(restingLeft, 1);
    }

    function test_rip_settlesAtMostOnce() public {
        _enrollMany(maker, 3, 50 * WAD);
        (,,, uint256 totalPayment) = engine.quoteRip(1);
        vm.prank(taker);
        uint256[] memory drawn = engine.rip(1, totalPayment);

        // Already unlisted — releaseToRecipient would revert PackNotListed if called again.
        // Engine no longer has it resting, so it cannot be drawn again.
        (uint256[] memory eligible,, uint256 count) = engine.eligibleSnapshot();
        for (uint256 i; i < count; ++i) {
            assertTrue(eligible[i] != drawn[0]);
        }
    }

    function test_rip_emptyReverts() public {
        vm.expectRevert(RipEngine.EmptyEligibleSet.selector);
        vm.prank(taker);
        engine.rip(1, type(uint256).max);
    }

    function test_rip_degenerateReverts() public {
        _enrollPack(maker, 50 * WAD);
        vm.expectRevert(abi.encodeWithSelector(RipEngine.DegenerateEligibleSet.selector, uint256(1), uint256(1)));
        vm.prank(taker);
        engine.rip(1, type(uint256).max);
    }
}
