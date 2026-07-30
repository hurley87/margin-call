// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {RipEngine} from "../src/RipEngine.sol";
import {RipMath} from "../src/libraries/RipMath.sol";
import {RipEngineFixture} from "./helpers/RipEngineFixture.sol";

contract RipEnginePricingTest is RipEngineFixture {
    function test_quoteRip_pricesOffSingleSnapshot() public {
        _enrollPack(maker, 22 * WAD);
        _enrollPack(maker, 100 * WAD);
        _enrollPack(maker2, 200 * WAD);

        (uint256 eligible, uint256 hm, uint256 unitPrice, uint256 totalPayment) = engine.quoteRip(1);
        assertEq(eligible, 3);

        uint256[] memory navs = new uint256[](3);
        navs[0] = 22 * WAD;
        navs[1] = 100 * WAD;
        navs[2] = 200 * WAD;
        uint256 expectedHm = RipMath.harmonicMean(navs);
        assertEq(hm, expectedHm);

        uint256 expectedUnit =
            RipMath.clampUnitPrice(expectedHm, registry.surcharge(), registry.minPackNav(), registry.poolMax());
        assertEq(unitPrice, expectedUnit);
        assertEq(totalPayment, (expectedUnit * 1e6) / WAD); // MockUSD 6 decimals
    }

    function test_quoteRip_batchUsesSameUnitPrice() public {
        _enrollMany(maker, 4, 50 * WAD);

        (,, uint256 unit1, uint256 total1) = engine.quoteRip(1);
        (,, uint256 unit2, uint256 total2) = engine.quoteRip(2);
        assertEq(unit1, unit2);
        assertEq(total2, total1 * 2);
    }

    function test_quoteRip_emptyEligibleReverts() public {
        vm.expectRevert(RipEngine.EmptyEligibleSet.selector);
        engine.quoteRip(1);
    }

    function test_quoteRip_degenerateReverts() public {
        // One eligible — cannot rip 1 (needs eligible > count).
        _enrollPack(maker, 50 * WAD);
        vm.expectRevert(abi.encodeWithSelector(RipEngine.DegenerateEligibleSet.selector, uint256(1), uint256(1)));
        engine.quoteRip(1);
    }

    function test_quoteRip_countOutOfRange() public {
        _enrollMany(maker, 3, 50 * WAD);
        vm.expectRevert(abi.encodeWithSelector(RipEngine.CountOutOfRange.selector, uint256(0), uint256(5)));
        engine.quoteRip(0);

        vm.expectRevert(abi.encodeWithSelector(RipEngine.CountOutOfRange.selector, uint256(6), uint256(5)));
        engine.quoteRip(6);
    }

    function test_quoteRip_bandClampFloor() public {
        // Force hm near min by enrolling only min-NAV packs; price = min*(1+s).
        _enrollMany(maker, 3, 20 * WAD);
        (,, uint256 unitPrice,) = engine.quoteRip(1);
        uint256 floor = (20 * WAD * 11) / 10; // 10% surcharge
        assertEq(unitPrice, floor);
    }
}
