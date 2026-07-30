// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {GameToken} from "../src/GameToken.sol";

contract GameTokenFuzzTest is Test {
    GameToken public token;

    address admin = makeAddr("admin");
    address treasury = makeAddr("treasury");
    address distributor = makeAddr("distributor");

    uint256 constant SUPPLY = 1_000_000_000e18;

    bytes32 distributorRole;

    function setUp() public {
        token = new GameToken(admin, treasury, SUPPLY);
        distributorRole = token.DISTRIBUTOR_ROLE();
        vm.prank(admin);
        token.grantRole(distributorRole, distributor);
    }

    function testFuzz_supplyIsWhateverWasMintedOnce(uint256 supply) public {
        supply = bound(supply, 1, type(uint208).max);

        GameToken fresh = new GameToken(admin, treasury, supply);
        assertEq(fresh.totalSupply(), supply);
        assertEq(fresh.balanceOf(treasury), supply);
    }

    function testFuzz_anyUserPairFailsClosedWhileLocked(address from, address to, uint256 amount) public {
        vm.assume(from != address(0) && to != address(0));
        vm.assume(from != treasury);
        vm.assume(!token.hasRole(distributorRole, from));
        vm.assume(!token.hasRole(distributorRole, to));
        amount = bound(amount, 1, 1_000e18);

        // Give `from` a balance through the exempt path so the revert can only be the lock.
        vm.prank(treasury);
        token.transfer(distributor, amount);
        vm.prank(distributor);
        token.transfer(from, amount);

        vm.expectRevert(abi.encodeWithSelector(GameToken.TransfersLocked.selector, from, to));
        vm.prank(from);
        token.transfer(to, amount);

        assertEq(token.balanceOf(from), amount);
        assertEq(token.totalSupply(), SUPPLY);
    }

    function testFuzz_distributorPayoutsAlwaysPass(address claimant, uint256 amount) public {
        vm.assume(claimant != address(0) && claimant != distributor && claimant != treasury);
        amount = bound(amount, 1, 1_000_000e18);

        vm.prank(treasury);
        token.transfer(distributor, amount);
        vm.prank(distributor);
        token.transfer(claimant, amount);

        assertEq(token.balanceOf(claimant), amount);
        assertEq(token.balanceOf(distributor), 0);
        assertEq(token.totalSupply(), SUPPLY);
    }

    function testFuzz_fundingTheDistributorAlwaysPasses(uint256 amount) public {
        amount = bound(amount, 1, SUPPLY);

        vm.prank(treasury);
        token.transfer(distributor, amount);

        assertEq(token.balanceOf(distributor), amount);
        assertEq(token.balanceOf(treasury), SUPPLY - amount);
    }

    function testFuzz_transfersFreeAfterEnable(address from, address to, uint256 amount) public {
        vm.assume(from != address(0) && to != address(0) && from != to);
        vm.assume(to != treasury && to != distributor);
        amount = bound(amount, 1, 1_000e18);

        vm.prank(treasury);
        token.transfer(distributor, amount);
        vm.prank(distributor);
        token.transfer(from, amount);

        vm.prank(admin);
        uint256 eta = token.scheduleTransferEnable();
        vm.warp(eta);
        vm.prank(admin);
        token.enableTransfers();

        vm.prank(from);
        token.transfer(to, amount);

        assertEq(token.balanceOf(to), amount);
        assertEq(token.totalSupply(), SUPPLY);
    }

    function testFuzz_enableNeverEarlyThanTheDelay(uint256 waited) public {
        waited = bound(waited, 0, token.TRANSFER_ENABLE_DELAY() - 1);

        vm.prank(admin);
        uint256 eta = token.scheduleTransferEnable();

        vm.warp(block.timestamp + waited);
        vm.expectRevert(abi.encodeWithSelector(GameToken.TransferEnableNotElapsed.selector, eta, block.timestamp));
        vm.prank(admin);
        token.enableTransfers();
    }
}
