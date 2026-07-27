// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {MockUSD} from "../src/MockUSD.sol";

/// @notice Fuzz mint amounts and recipients; balance and total-supply conservation.
contract MockUSDFuzzTest is Test {
    MockUSD public token;

    address admin = makeAddr("admin");
    address minter = makeAddr("minter");

    function setUp() public {
        token = new MockUSD(admin);
        bytes32 minterRole = token.MINTER_ROLE();
        vm.prank(admin);
        token.grantRole(minterRole, minter);
    }

    function testFuzz_mintConservesSupply(address to, uint256 amount) public {
        vm.assume(to != address(0));
        amount = bound(amount, 1, type(uint128).max);

        uint256 supplyBefore = token.totalSupply();
        uint256 balanceBefore = token.balanceOf(to);

        vm.prank(minter);
        token.mint(to, amount);

        assertEq(token.totalSupply(), supplyBefore + amount);
        assertEq(token.balanceOf(to), balanceBefore + amount);
    }

    function testFuzz_nonMinterCannotMint(address caller, address to, uint256 amount) public {
        vm.assume(caller != minter);
        vm.assume(to != address(0));
        amount = bound(amount, 1, type(uint128).max);

        bytes32 role = token.MINTER_ROLE();
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, caller, role));
        vm.prank(caller);
        token.mint(to, amount);
    }

    function testFuzz_transferConservesSupply(address to, uint256 mintAmt, uint256 transferAmt) public {
        address from = makeAddr("from");
        vm.assume(to != address(0) && to != from);
        mintAmt = bound(mintAmt, 1, type(uint128).max);
        transferAmt = bound(transferAmt, 1, mintAmt);

        vm.prank(minter);
        token.mint(from, mintAmt);

        uint256 supplyBefore = token.totalSupply();

        vm.prank(from);
        token.transfer(to, transferAmt);

        assertEq(token.totalSupply(), supplyBefore);
        assertEq(token.balanceOf(from), mintAmt - transferAmt);
        assertEq(token.balanceOf(to), transferAmt);
    }
}
