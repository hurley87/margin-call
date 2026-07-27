// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {MockUSD} from "../src/MockUSD.sol";

contract MockUSDTest is Test {
    MockUSD public token;

    address admin = makeAddr("admin");
    address minter = makeAddr("minter");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address stranger = makeAddr("stranger");

    uint256 constant ONE = 1e6; // $1 in 6-decimal units

    function setUp() public {
        token = new MockUSD(admin);
        bytes32 minterRole = token.MINTER_ROLE();
        vm.prank(admin);
        token.grantRole(minterRole, minter);
    }

    // ========== Labelling ==========

    function test_nameAndSymbolLabelledAsTestAsset() public view {
        assertEq(token.name(), "Margin Call Mock USD (Test Asset)");
        assertEq(token.symbol(), "MOCKUSD");
    }

    function test_isTestAssetConstant() public view {
        assertTrue(token.IS_TEST_ASSET());
    }

    function test_testAssetNoticeDisclosesValueless() public view {
        string memory notice = token.TEST_ASSET_NOTICE();
        assertTrue(bytes(notice).length > 0);
        // Notice must mention the asset is a test / valueless disclosure.
        assertTrue(_contains(notice, "VALUELESS") || _contains(notice, "TEST"));
    }

    function test_decimalsAreSix() public view {
        assertEq(token.decimals(), 6);
    }

    // ========== Mint access control ==========

    function test_minterCanMint() public {
        vm.prank(minter);
        token.mint(alice, 50 * ONE);

        assertEq(token.balanceOf(alice), 50 * ONE);
        assertEq(token.totalSupply(), 50 * ONE);
    }

    function test_nonMinterCannotMint() public {
        bytes32 role = token.MINTER_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        vm.prank(stranger);
        token.mint(alice, ONE);
    }

    function test_adminCannotMintWithoutMinterRole() public {
        bytes32 role = token.MINTER_ROLE();
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, admin, role));
        vm.prank(admin);
        token.mint(alice, ONE);
    }

    function test_adminCanGrantAndRevokeMinter() public {
        address newMinter = makeAddr("newMinter");
        bytes32 minterRole = token.MINTER_ROLE();

        vm.prank(admin);
        token.grantRole(minterRole, newMinter);

        vm.prank(newMinter);
        token.mint(alice, ONE);
        assertEq(token.balanceOf(alice), ONE);

        vm.prank(admin);
        token.revokeRole(minterRole, newMinter);

        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, newMinter, minterRole)
        );
        vm.prank(newMinter);
        token.mint(alice, ONE);
    }

    function test_revokedMinterBlocked() public {
        bytes32 minterRole = token.MINTER_ROLE();
        vm.prank(admin);
        token.revokeRole(minterRole, minter);

        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, minter, minterRole)
        );
        vm.prank(minter);
        token.mint(alice, ONE);
    }

    function test_constructorRejectsZeroAdmin() public {
        vm.expectRevert("MockUSD: zero admin");
        new MockUSD(address(0));
    }

    function test_constructorGrantsAdminRole() public view {
        assertTrue(token.hasRole(token.DEFAULT_ADMIN_ROLE(), admin));
        assertFalse(token.hasRole(token.MINTER_ROLE(), admin));
    }

    // ========== Ordinary ERC-20 ==========

    function test_transferAndApprove() public {
        vm.prank(minter);
        token.mint(alice, 100 * ONE);

        vm.prank(alice);
        token.approve(bob, 40 * ONE);
        assertEq(token.allowance(alice, bob), 40 * ONE);

        vm.prank(bob);
        token.transferFrom(alice, bob, 25 * ONE);

        assertEq(token.balanceOf(alice), 75 * ONE);
        assertEq(token.balanceOf(bob), 25 * ONE);
        assertEq(token.allowance(alice, bob), 15 * ONE);

        vm.prank(alice);
        token.transfer(bob, 10 * ONE);
        assertEq(token.balanceOf(alice), 65 * ONE);
        assertEq(token.balanceOf(bob), 35 * ONE);
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length > h.length) return false;
        for (uint256 i = 0; i <= h.length - n.length; i++) {
            bool match_ = true;
            for (uint256 j = 0; j < n.length; j++) {
                if (h[i + j] != n[j]) {
                    match_ = false;
                    break;
                }
            }
            if (match_) return true;
        }
        return false;
    }
}
