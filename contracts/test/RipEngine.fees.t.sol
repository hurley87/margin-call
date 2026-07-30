// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Test} from "forge-std/Test.sol";
import {RipEngine} from "../src/RipEngine.sol";
import {MockRandomness} from "../src/mocks/MockRandomness.sol";
import {RipEngineFixture} from "./helpers/RipEngineFixture.sol";

contract RipEngineFeesTest is Test, RipEngineFixture {
    function test_claim_withdrawsAccruedAcquisitionFee() public {
        uint256 a = _enrollPack(maker, 30 * WAD);
        uint256 b = _enrollPack(maker2, 40 * WAD);
        uint256 c = _enrollPack(maker, 50 * WAD);

        (,,, uint256 totalPayment) = engine.quoteRip(1);
        vm.prank(taker);
        uint256[] memory drawn = engine.rip(1, totalPayment);

        uint256[] memory ids = new uint256[](3);
        ids[0] = a;
        ids[1] = b;
        ids[2] = c;

        uint256 makerPending;
        uint256 maker2Pending;
        for (uint256 i; i < 3; ++i) {
            if (drawn[0] == ids[i]) continue;
            if (engine.makerOf(ids[i]) == maker) makerPending += engine.pendingOf(ids[i]);
            if (engine.makerOf(ids[i]) == maker2) maker2Pending += engine.pendingOf(ids[i]);
        }
        assertGt(makerPending + maker2Pending, 0);

        if (makerPending > 0) {
            uint256 before = usd.balanceOf(maker);
            vm.prank(maker);
            uint256 claimed = engine.claim(ids);
            assertEq(claimed, makerPending);
            assertEq(usd.balanceOf(maker), before + claimed);
        }

        if (maker2Pending > 0) {
            uint256 before2 = usd.balanceOf(maker2);
            vm.prank(maker2);
            uint256 claimed2 = engine.claim(ids);
            assertEq(claimed2, maker2Pending);
            assertEq(usd.balanceOf(maker2), before2 + claimed2);
        }
    }

    function test_claim_makerReceivesEqualRateShare() public {
        uint256 a = _enrollPack(maker, 40 * WAD);
        uint256 b = _enrollPack(maker, 50 * WAD);
        uint256 c = _enrollPack(maker, 60 * WAD);

        (,,, uint256 totalPayment) = engine.quoteRip(1);
        uint256 surcharge = registry.surcharge();
        uint256 baseStable = (totalPayment * WAD) / (WAD + surcharge);
        uint256 surStable = totalPayment - baseStable;
        uint256 protocolCut = (surStable * registry.protocolShareOfSurcharge()) / WAD;
        uint256 toMakers = totalPayment - protocolCut;

        vm.prank(taker);
        engine.rip(1, totalPayment);

        uint256 perPack = toMakers / 2;
        assertEq(engine.accFeePerPack(), perPack);

        uint256 pendingA = engine.pendingOf(a);
        uint256 pendingB = engine.pendingOf(b);
        uint256 pendingC = engine.pendingOf(c);
        assertEq(pendingA + pendingB + pendingC, perPack * 2);

        uint256[] memory ids = new uint256[](3);
        ids[0] = a;
        ids[1] = b;
        ids[2] = c;

        uint256 before = usd.balanceOf(maker);
        vm.prank(maker);
        uint256 claimed = engine.claim(ids);
        assertEq(claimed, perPack * 2);
        assertEq(usd.balanceOf(maker), before + claimed);
        assertGe(claimed, baseStable);
    }

    function test_claim_emptyTokenIdsWithdrawsCrystallizedOnly() public {
        _enrollPack(maker, 40 * WAD);
        _enrollPack(maker, 50 * WAD);
        _enrollPack(maker2, 60 * WAD);

        (,,, uint256 totalPayment) = engine.quoteRip(1);
        vm.prank(taker);
        engine.rip(1, totalPayment);

        uint256[] memory resting = engine.restingPackIds();
        for (uint256 i; i < resting.length; ++i) {
            if (engine.makerOf(resting[i]) == maker && packs.isListed(resting[i])) {
                vm.prank(maker);
                engine.exitPool(resting[i]);
            }
        }

        uint256 claimable = engine.claimableFees(maker);
        assertGt(claimable, 0);

        uint256[] memory none = new uint256[](0);
        uint256 before = usd.balanceOf(maker);
        vm.prank(maker);
        uint256 amt = engine.claim(none);
        assertEq(amt, claimable);
        assertEq(usd.balanceOf(maker), before + amt);
        assertEq(engine.claimableFees(maker), 0);
    }

    function test_claim_nothingReverts() public {
        uint256[] memory none = new uint256[](0);
        vm.expectRevert(RipEngine.NothingToClaim.selector);
        vm.prank(maker);
        engine.claim(none);
    }

    function test_ghostPackDoesNotDiluteFees() public {
        _enrollPack(maker, 40 * WAD);
        uint256 ghost = _enrollPack(maker, 50 * WAD);
        _enrollPack(maker2, 60 * WAD);

        vm.prank(maker);
        packs.delistAndRedeem(ghost);
        assertFalse(packs.isListed(ghost));
        assertTrue(engine.isResting(ghost));

        (,,, uint256 totalPayment) = engine.quoteRip(1);
        uint256 surcharge = registry.surcharge();
        uint256 surStable = totalPayment - (totalPayment * WAD) / (WAD + surcharge);
        uint256 protocolCut = (surStable * registry.protocolShareOfSurcharge()) / WAD;
        uint256 toMakers = totalPayment - protocolCut;

        vm.prank(taker);
        engine.rip(1, totalPayment);

        // Ghost purged; one drawn; one remains → divisor is 1, not diluted by the ghost.
        assertFalse(engine.isResting(ghost));
        assertEq(engine.restingCount(), 1);
        assertEq(engine.accFeePerPack(), toMakers);
        assertEq(engine.feeDust(), 0);
    }

    function test_withdrawProtocolFees() public {
        _enrollMany(maker, 3, 50 * WAD);
        (,,, uint256 totalPayment) = engine.quoteRip(1);
        vm.prank(taker);
        engine.rip(1, totalPayment);

        uint256 accrued = engine.protocolAccrued();
        assertGt(accrued, 0);

        address treasury = makeAddr("treasury");
        vm.prank(admin);
        uint256 withdrawn = engine.withdrawProtocolFees(treasury);
        assertEq(withdrawn, accrued);
        assertEq(usd.balanceOf(treasury), accrued);
        assertEq(engine.protocolAccrued(), 0);
    }

    function test_withdrawProtocolFees_unauthorized() public {
        bytes32 role = engine.DEFAULT_ADMIN_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        vm.prank(stranger);
        engine.withdrawProtocolFees(stranger);
    }

    function test_setRandomness() public {
        MockRandomness next = new MockRandomness(admin, 99);
        vm.prank(admin);
        engine.setRandomness(address(next));
        assertEq(address(engine.randomness()), address(next));
    }
}
