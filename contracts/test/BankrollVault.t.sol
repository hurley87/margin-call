// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {BankrollVault} from "../src/BankrollVault.sol";
import {DeskDollars} from "../src/DeskDollars.sol";

contract BankrollVaultTest is Test {
    uint256 internal constant ONE_TUSD = 1_000_000;

    address internal constant BANKROLL = address(0xB4A0B011);
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant CAROL = address(0xCA401);

    DeskDollars internal token;
    BankrollVault internal vault;

    function setUp() public {
        token = new DeskDollars(BANKROLL);
        vault = new BankrollVault(token);

        vm.startPrank(BANKROLL);
        assertTrue(token.transfer(ALICE, 1_000 * ONE_TUSD));
        assertTrue(token.transfer(BOB, 1_000 * ONE_TUSD));
        token.approve(address(vault), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(ALICE);
        token.approve(address(vault), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(BOB);
        token.approve(address(vault), type(uint256).max);
        vm.stopPrank();
    }

    function testFirstDepositMintsOneToOneSharesAndExposesPreGameViews() public {
        assertEq(vault.grossAssets(), 0);
        assertEq(vault.totalAssets(), 0);
        assertEq(vault.totalSupply(), 0);
        assertEq(vault.assetsPerShare(), ONE_TUSD);
        assertEq(vault.pendingObligations(), 0);
        assertEq(vault.unrecognizedMargin(), 0);

        uint256 assets = 125 * ONE_TUSD;
        vm.prank(ALICE);
        uint256 shares = vault.deposit(assets, ALICE);

        assertEq(shares, assets);
        assertEq(vault.balanceOf(ALICE), assets);
        assertEq(vault.grossAssets(), assets);
        assertEq(vault.totalAssets(), assets);
        assertEq(vault.totalSupply(), assets);
        assertEq(vault.assetsPerShare(), ONE_TUSD);
    }

    function testSecondWalletReceivesProportionalShares() public {
        vm.prank(ALICE);
        vault.deposit(100 * ONE_TUSD, ALICE);

        vm.prank(BOB);
        uint256 shares = vault.deposit(300 * ONE_TUSD, BOB);

        assertEq(shares, 300 * ONE_TUSD);
        assertEq(vault.balanceOf(ALICE), 100 * ONE_TUSD);
        assertEq(vault.balanceOf(BOB), 300 * ONE_TUSD);
        assertEq(vault.totalAssets(), 400 * ONE_TUSD);
        assertEq(vault.totalSupply(), 400 * ONE_TUSD);
    }

    function testDepositAndMintMatchStandardPreviewsAndConversions() public {
        vm.prank(ALICE);
        vault.deposit(400 * ONE_TUSD, ALICE);

        uint256 depositAssets = 125 * ONE_TUSD;
        uint256 expectedDepositShares = vault.previewDeposit(depositAssets);
        assertEq(vault.convertToShares(depositAssets), expectedDepositShares);

        vm.prank(BOB);
        uint256 depositedShares = vault.deposit(depositAssets, BOB);
        assertEq(depositedShares, expectedDepositShares);

        uint256 mintShares = 75 * ONE_TUSD;
        uint256 expectedMintAssets = vault.previewMint(mintShares);
        assertEq(vault.convertToAssets(mintShares), expectedMintAssets);

        vm.prank(BOB);
        uint256 mintedAssets = vault.mint(mintShares, BOB);
        assertEq(mintedAssets, expectedMintAssets);
        assertEq(vault.balanceOf(BOB), depositedShares + mintShares);
    }

    function testWithdrawAndRedeemAreDisabled() public {
        vm.prank(ALICE);
        vault.deposit(100 * ONE_TUSD, ALICE);

        assertEq(vault.maxWithdraw(ALICE), 0);
        assertEq(vault.maxRedeem(ALICE), 0);

        vm.expectRevert(BankrollVault.WithdrawalsDisabledInDepositsOnlySlice.selector);
        vm.prank(ALICE);
        vault.withdraw(ONE_TUSD, ALICE, ALICE);

        vm.expectRevert(BankrollVault.WithdrawalsDisabledInDepositsOnlySlice.selector);
        vm.prank(ALICE);
        vault.redeem(ONE_TUSD, ALICE, ALICE);
    }

    function testVaultDepositEventReconstructsDepositForAnotherReceiver() public {
        uint256 assets = 50 * ONE_TUSD;
        uint256 shares = vault.previewDeposit(assets);

        vm.expectEmit(true, true, false, true, address(vault));
        emit BankrollVault.VaultDeposit(ALICE, CAROL, assets, shares);

        vm.prank(ALICE);
        vault.deposit(assets, CAROL);

        assertEq(vault.balanceOf(ALICE), 0);
        assertEq(vault.balanceOf(CAROL), shares);
        assertEq(token.balanceOf(ALICE), 1_000 * ONE_TUSD - assets);
    }
}
