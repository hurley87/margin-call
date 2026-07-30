// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Distributor} from "../src/Distributor.sol";
import {DistributorFixture} from "./helpers/DistributorFixture.sol";

contract DistributorAccessTest is Test, DistributorFixture {
    function test_setRipEngineIsOneShot() public {
        Distributor fresh = new Distributor(admin, address(token));
        vm.prank(admin);
        fresh.setRipEngine(ripEngine);

        vm.prank(admin);
        vm.expectRevert(Distributor.RipEngineAlreadySet.selector);
        fresh.setRipEngine(stranger);
    }

    function test_nonAdminCannotSetRatesOrEngine() public {
        Distributor fresh = new Distributor(admin, address(token));

        vm.prank(stranger);
        vm.expectRevert();
        fresh.setRipEngine(ripEngine);

        vm.prank(stranger);
        vm.expectRevert();
        distributor.setMakerRatePerEpoch(1);

        vm.prank(stranger);
        vm.expectRevert();
        distributor.setTakerPotPerEpoch(1);
    }

    function test_sweepRejectsGameToken() public {
        vm.prank(admin);
        vm.expectRevert(Distributor.CannotSweepGameToken.selector);
        distributor.sweep(address(token), admin, 1);
    }

    function test_sweepRecoversOtherToken() public {
        JunkERC20 junk = new JunkERC20();
        junk.mint(address(distributor), 5e18);

        vm.prank(admin);
        distributor.sweep(address(junk), stranger, 5e18);
        assertEq(IERC20(address(junk)).balanceOf(stranger), 5e18);
    }

    function test_epochGridAnchoredToDeploy() public {
        assertEq(distributor.currentEpoch(), 0);
        assertEq(distributor.epochStart(0), distributor.epochZeroStart());
        assertEq(distributor.epochStart(1), distributor.epochZeroStart() + 1 days);

        vm.warp(distributor.epochZeroStart() + 1 days);
        assertEq(distributor.currentEpoch(), 1);
    }
}

contract JunkERC20 is ERC20 {
    constructor() ERC20("Junk", "JUNK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
