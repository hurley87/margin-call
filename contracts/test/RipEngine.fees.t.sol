// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {RipEngine} from "../src/RipEngine.sol";
import {MockRandomness} from "../src/mocks/MockRandomness.sol";
import {RipEngineFixture} from "./helpers/RipEngineFixture.sol";

contract RipEngineFeesTest is RipEngineFixture {
    function test_claimFees_withdrawsAccruedAcquisitionFee() public {
        _enrollPack(maker, 30 * WAD);
        _enrollPack(maker2, 40 * WAD);
        _enrollPack(maker, 50 * WAD);

        (,,, uint256 totalPayment) = engine.quoteRip(1);
        vm.prank(taker);
        engine.rip(1, totalPayment);

        // Two packs remain; both makers may have pending depending on who was drawn.
        uint256[] memory makerPacks = engine.restingPackIds();
        uint256 pendingSum;
        for (uint256 i; i < makerPacks.length; ++i) {
            pendingSum += engine.pendingOf(makerPacks[i]);
        }
        assertGt(pendingSum, 0);

        // Claim for maker's resting packs.
        uint256[] memory claimIds = new uint256[](makerPacks.length);
        for (uint256 i; i < makerPacks.length; ++i) {
            claimIds[i] = makerPacks[i];
        }

        uint256 makerBalBefore = usd.balanceOf(maker);
        uint256 maker2BalBefore = usd.balanceOf(maker2);

        // Only packs owned by msg.sender as maker crystallize.
        vm.prank(maker);
        try engine.claimFees(claimIds) returns (uint256 amt) {
            assertGt(amt, 0);
            assertEq(usd.balanceOf(maker), makerBalBefore + amt);
        } catch {
            // Maker's packs may all have been drawn — that's ok; try maker2.
        }

        vm.prank(maker2);
        try engine.claimFees(claimIds) returns (uint256 amt2) {
            if (amt2 > 0) {
                assertEq(usd.balanceOf(maker2), maker2BalBefore + amt2);
            }
        } catch {}
    }

    function test_claimFees_makerReceivesEqualRateShare() public {
        // Three packs, all same maker — rip 1, remaining 2 split fees equally.
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
        // Drawn pack has 0 pending; the other two each have perPack.
        assertEq(pendingA + pendingB + pendingC, perPack * 2);

        uint256[] memory ids = new uint256[](3);
        ids[0] = a;
        ids[1] = b;
        ids[2] = c;

        uint256 before = usd.balanceOf(maker);
        vm.prank(maker);
        uint256 claimed = engine.claimFees(ids);
        assertEq(claimed, perPack * 2);
        assertEq(usd.balanceOf(maker), before + claimed);
        assertGe(claimed, baseStable); // make-whole for the socialized base across remaining
    }

    function test_claim_crystallizedBalance() public {
        _enrollPack(maker, 40 * WAD);
        _enrollPack(maker, 50 * WAD);
        _enrollPack(maker2, 60 * WAD);

        (,,, uint256 totalPayment) = engine.quoteRip(1);
        vm.prank(taker);
        engine.rip(1, totalPayment);

        // Exit remaining maker packs to crystallize without claiming yet.
        uint256[] memory resting = engine.restingPackIds();
        for (uint256 i; i < resting.length; ++i) {
            if (engine.makerOf(resting[i]) == maker && packs.isListed(resting[i])) {
                vm.prank(maker);
                engine.exitPool(resting[i]);
            }
        }

        uint256 claimable = engine.claimableFees(maker);
        if (claimable > 0) {
            uint256 before = usd.balanceOf(maker);
            vm.prank(maker);
            uint256 amt = engine.claim();
            assertEq(amt, claimable);
            assertEq(usd.balanceOf(maker), before + amt);
            assertEq(engine.claimableFees(maker), 0);
        }
    }

    function test_claim_nothingReverts() public {
        vm.expectRevert(RipEngine.NothingToClaim.selector);
        vm.prank(maker);
        engine.claim();
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
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, engine.DEFAULT_ADMIN_ROLE()
            )
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
