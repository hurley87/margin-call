// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {DeskDollars} from "../src/DeskDollars.sol";
import {DeskDollarsFaucet} from "../src/DeskDollarsFaucet.sol";

contract DeskDollarsTest is Test {
    address internal constant BANKROLL = address(0xB4A0B011);
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant DEPLOYER = address(0xD3E10E);

    DeskDollars internal token;
    DeskDollarsFaucet internal faucet;

    function setUp() public {
        vm.startPrank(DEPLOYER);
        token = new DeskDollars(BANKROLL);
        faucet = new DeskDollarsFaucet(token);
        token.configureFaucet(address(faucet));
        vm.stopPrank();
    }

    function testMetadataAndDecimals() public view {
        assertEq(token.name(), "Desk Dollars");
        assertEq(token.symbol(), "tUSD");
        assertEq(token.decimals(), 6);
    }

    function testDeploymentMintsExactBankrollSeedToRecipient() public view {
        assertEq(token.totalSupply(), 25_000_000_000);
        assertEq(token.balanceOf(BANKROLL), 25_000_000_000);
        assertEq(token.balanceOf(address(faucet)), 0);
    }

    function testClaimMintsExactAmount() public {
        vm.warp(1_000);
        vm.expectEmit(true, false, false, true, address(faucet));
        emit DeskDollarsFaucet.FaucetClaimed(ALICE, 100_000_000, 4_600);

        vm.prank(ALICE);
        faucet.claim();

        assertEq(token.balanceOf(ALICE), 100_000_000);
        assertEq(token.totalSupply(), 25_100_000_000);
        assertEq(faucet.nextClaimAt(ALICE), 4_600);
    }

    function testClaimEnforcesCooldownUntilExactBoundary() public {
        vm.warp(1_000);
        vm.prank(ALICE);
        faucet.claim();

        vm.warp(4_599);
        vm.expectRevert(abi.encodeWithSelector(DeskDollarsFaucet.ClaimCooldown.selector, ALICE, 4_600));
        vm.prank(ALICE);
        faucet.claim();

        vm.warp(4_600);
        vm.prank(ALICE);
        faucet.claim();

        assertEq(token.balanceOf(ALICE), 200_000_000);
        assertEq(faucet.nextClaimAt(ALICE), 8_200);
    }

    function testWalletsHaveIndependentCooldowns() public {
        vm.warp(1_000);
        vm.prank(ALICE);
        faucet.claim();

        vm.prank(BOB);
        faucet.claim();

        assertEq(token.balanceOf(ALICE), 100_000_000);
        assertEq(token.balanceOf(BOB), 100_000_000);
        assertEq(faucet.nextClaimAt(ALICE), faucet.nextClaimAt(BOB));
    }

    function testRepeatedClaimsAfterCooldownIncreaseSupplyOnlyByClaimAmount() public {
        vm.warp(1_000);
        vm.startPrank(ALICE);
        faucet.claim();
        vm.warp(4_600);
        faucet.claim();
        vm.warp(8_200);
        faucet.claim();
        vm.stopPrank();

        assertEq(token.balanceOf(ALICE), 300_000_000);
        assertEq(token.totalSupply(), 25_300_000_000);
    }

    function testOnlyConfiguredFaucetCanMintAfterDeploymentHandoff() public {
        vm.expectRevert(abi.encodeWithSelector(DeskDollars.NotFaucet.selector, ALICE));
        vm.prank(ALICE);
        token.mintFromFaucet(ALICE, 1);

        vm.expectRevert(DeskDollars.FaucetAlreadyConfigured.selector);
        vm.prank(DEPLOYER);
        token.configureFaucet(ALICE);

        assertEq(token.faucet(), address(faucet));
        assertEq(token.totalSupply(), 25_000_000_000);
    }

    function testOnlyDeploymentConfigurerCanCompleteHandoff() public {
        DeskDollars unconfiguredToken = new DeskDollars(BANKROLL);

        vm.expectRevert(abi.encodeWithSelector(DeskDollars.UnauthorizedFaucetConfigurer.selector, ALICE));
        vm.prank(ALICE);
        unconfiguredToken.configureFaucet(address(faucet));
    }
}
