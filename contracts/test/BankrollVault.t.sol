// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";

import {BankrollVault} from "../src/BankrollVault.sol";
import {DeskDollars} from "../src/DeskDollars.sol";

contract BankrollVaultHarness is BankrollVault {
    constructor(DeskDollars asset_) BankrollVault(asset_) {}

    function setReservedLiabilitiesForTest(uint256 amount) external {
        reservedLiabilities = amount;
    }

    function setPendingObligationsForTest(uint256 amount) external {
        pendingObligations = amount;
    }

    function setUnrecognizedMarginForTest(uint256 amount) external {
        unrecognizedMargin = amount;
    }
}

contract BankrollVaultTest is Test {
    uint256 internal constant ONE_TUSD = 1_000_000;

    address internal constant BANKROLL = address(0xB4A0B011);
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant CAROL = address(0xCA401);

    DeskDollars internal token;
    BankrollVaultHarness internal vault;

    function setUp() public {
        token = new DeskDollars(BANKROLL);
        vault = new BankrollVaultHarness(token);

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
        assertEq(vault.reservedLiabilities(), 0);
        assertEq(vault.safetyBuffer(), 0);
        assertEq(vault.freeLiquidity(), 0);

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

    function testSafetyBufferRoundsUpAtExactlyTwentyPercent() public {
        vm.prank(ALICE);
        vault.deposit(4, ALICE);

        assertEq(vault.safetyBuffer(), 1);
        assertEq(vault.freeLiquidity(), 3);

        vm.prank(ALICE);
        vault.deposit(1, ALICE);

        assertEq(vault.safetyBuffer(), 1);
        assertEq(vault.freeLiquidity(), 4);
    }

    function testFreeLiquiditySaturatesAtZeroForReservationsAndBuffer() public {
        vm.prank(ALICE);
        vault.deposit(100 * ONE_TUSD, ALICE);

        vault.setReservedLiabilitiesForTest(80 * ONE_TUSD);

        assertEq(vault.safetyBuffer(), 20 * ONE_TUSD);
        assertEq(vault.freeLiquidity(), 0);
        assertEq(vault.maxWithdraw(ALICE), 0);
        assertEq(vault.maxRedeem(ALICE), 0);
    }

    function testMaxWithdrawPartitionsFreeLiquidityProportionally() public {
        vm.prank(ALICE);
        vault.deposit(100 * ONE_TUSD, ALICE);

        vm.prank(BOB);
        vault.deposit(300 * ONE_TUSD, BOB);

        vault.setReservedLiabilitiesForTest(80 * ONE_TUSD);

        assertEq(vault.grossAssets(), 400 * ONE_TUSD);
        assertEq(vault.safetyBuffer(), 80 * ONE_TUSD);
        assertEq(vault.freeLiquidity(), 240 * ONE_TUSD);
        assertEq(vault.maxWithdraw(ALICE), 60 * ONE_TUSD);
        assertEq(vault.maxWithdraw(BOB), 180 * ONE_TUSD);
    }

    function testNonzeroReservationsUseGrossAssetsInsteadOfNetPricingAssets() public {
        vm.prank(ALICE);
        vault.deposit(100 * ONE_TUSD, ALICE);

        vault.setReservedLiabilitiesForTest(30 * ONE_TUSD);

        assertEq(vault.totalAssets(), 100 * ONE_TUSD);
        assertEq(vault.safetyBuffer(), 20 * ONE_TUSD);
        assertEq(vault.freeLiquidity(), 50 * ONE_TUSD);
        assertEq(vault.maxWithdraw(ALICE), 50 * ONE_TUSD);
    }

    function testMaxLimitsAndPreviewsAreConsistentWithExecution() public {
        vm.prank(ALICE);
        vault.deposit(100 * ONE_TUSD, ALICE);

        vault.setReservedLiabilitiesForTest(30 * ONE_TUSD);

        uint256 maxAssets = vault.maxWithdraw(ALICE);
        uint256 maxShares = vault.maxRedeem(ALICE);
        uint256 expectedBurnedShares = vault.previewWithdraw(maxAssets);

        assertEq(maxAssets, 50 * ONE_TUSD);
        assertEq(maxShares, expectedBurnedShares);
        assertLe(vault.previewRedeem(maxShares), maxAssets);

        uint256 aliceAssetsBefore = token.balanceOf(ALICE);
        vm.prank(ALICE);
        uint256 burnedShares = vault.withdraw(maxAssets, ALICE, ALICE);

        assertEq(burnedShares, expectedBurnedShares);
        assertEq(token.balanceOf(ALICE), aliceAssetsBefore + maxAssets);
        assertEq(vault.balanceOf(ALICE), 100 * ONE_TUSD - burnedShares);
    }

    function testRedeemExecutesAtItsEnforceableLimit() public {
        vm.prank(ALICE);
        vault.deposit(100 * ONE_TUSD, ALICE);

        vault.setReservedLiabilitiesForTest(30 * ONE_TUSD);

        uint256 maxShares = vault.maxRedeem(ALICE);
        uint256 expectedAssets = vault.previewRedeem(maxShares);
        uint256 aliceAssetsBefore = token.balanceOf(ALICE);

        vm.prank(ALICE);
        uint256 assets = vault.redeem(maxShares, ALICE, ALICE);

        assertEq(assets, expectedAssets);
        assertEq(token.balanceOf(ALICE), aliceAssetsBefore + expectedAssets);
        assertEq(vault.balanceOf(ALICE), 100 * ONE_TUSD - maxShares);
    }

    function testMaxRedeemIncludesAllSharesWhoseRoundedDownAssetsFitTheLimitAfterALoss() public {
        vm.prank(ALICE);
        vault.deposit(4, ALICE);

        vault.setReservedLiabilitiesForTest(2);
        vault.setPendingObligationsForTest(2);

        assertEq(vault.totalSupply(), 4);
        assertEq(vault.totalAssets(), 2);
        assertEq(vault.maxWithdraw(ALICE), 1);
        assertEq(vault.previewRedeem(3), 1);
        assertEq(vault.maxRedeem(ALICE), 3);
        assertGt(vault.previewRedeem(vault.maxRedeem(ALICE) + 1), vault.maxWithdraw(ALICE));

        vm.prank(ALICE);
        assertEq(vault.redeem(3, ALICE, ALICE), 1);
    }

    function testFreeLiquidityKeepsPendingPayoutsFundedUnderTheReservationInvariant() public {
        vm.prank(ALICE);
        vault.deposit(4, ALICE);

        // Design invariant (technical design §8): pendingObligations +
        // unrecognizedMargin never exceeds reservedLiabilities, because a
        // reservation is consumed only when its payout or refund transfers.
        // Under it, subtracting reservations alone keeps every pending payout
        // and refund funded after a maximum LP withdrawal.
        vault.setReservedLiabilitiesForTest(2);
        vault.setPendingObligationsForTest(1);
        vault.setUnrecognizedMarginForTest(1);

        assertEq(vault.freeLiquidity(), 1);
        uint256 assets = vault.maxWithdraw(ALICE);
        assertEq(assets, 1);

        vm.prank(ALICE);
        vault.withdraw(assets, ALICE, ALICE);

        assertGe(vault.grossAssets(), vault.pendingObligations() + vault.unrecognizedMargin());
    }

    function testDelegatedWithdrawUsesOwnerLimitAndAllowance() public {
        vm.prank(ALICE);
        vault.deposit(100 * ONE_TUSD, ALICE);

        vault.setReservedLiabilitiesForTest(30 * ONE_TUSD);
        uint256 assets = vault.maxWithdraw(ALICE);
        uint256 shares = vault.previewWithdraw(assets);

        vm.prank(ALICE);
        vault.approve(BOB, shares);

        vm.prank(BOB);
        vault.withdraw(assets, CAROL, ALICE);

        assertEq(token.balanceOf(CAROL), assets);
        assertEq(vault.balanceOf(ALICE), 100 * ONE_TUSD - shares);
        assertEq(vault.allowance(ALICE, BOB), 0);
    }

    function testOverLimitWithdrawRevertsAtomicallyAtTheErc4626Boundary() public {
        vm.prank(ALICE);
        vault.deposit(100 * ONE_TUSD, ALICE);

        vault.setReservedLiabilitiesForTest(30 * ONE_TUSD);
        uint256 maxAssets = vault.maxWithdraw(ALICE);
        uint256 balanceBefore = token.balanceOf(ALICE);
        uint256 sharesBefore = vault.balanceOf(ALICE);
        uint256 grossAssetsBefore = vault.grossAssets();

        vm.expectRevert(
            abi.encodeWithSelector(ERC4626.ERC4626ExceededMaxWithdraw.selector, ALICE, maxAssets + 1, maxAssets)
        );
        vm.prank(ALICE);
        vault.withdraw(maxAssets + 1, ALICE, ALICE);

        assertEq(token.balanceOf(ALICE), balanceBefore);
        assertEq(vault.balanceOf(ALICE), sharesBefore);
        assertEq(vault.grossAssets(), grossAssetsBefore);
        assertEq(vault.reservedLiabilities(), 30 * ONE_TUSD);
        assertEq(vault.safetyBuffer(), 20 * ONE_TUSD);
    }

    function testOverLimitRedeemDoesNotConsumeDelegatedAllowance() public {
        vm.prank(ALICE);
        vault.deposit(100 * ONE_TUSD, ALICE);

        vault.setReservedLiabilitiesForTest(30 * ONE_TUSD);
        uint256 maxShares = vault.maxRedeem(ALICE);

        vm.prank(ALICE);
        vault.approve(BOB, maxShares + 1);

        vm.expectRevert(
            abi.encodeWithSelector(ERC4626.ERC4626ExceededMaxRedeem.selector, ALICE, maxShares + 1, maxShares)
        );
        vm.prank(BOB);
        vault.redeem(maxShares + 1, CAROL, ALICE);

        assertEq(vault.balanceOf(ALICE), 100 * ONE_TUSD);
        assertEq(vault.allowance(ALICE, BOB), maxShares + 1);
        assertEq(token.balanceOf(CAROL), 0);
    }

    function testWithdrawPreservesReservationsAndRequiredBuffer() public {
        vm.prank(ALICE);
        vault.deposit(100 * ONE_TUSD, ALICE);

        vault.setReservedLiabilitiesForTest(30 * ONE_TUSD);

        uint256 assets = vault.maxWithdraw(ALICE);
        vm.prank(ALICE);
        vault.withdraw(assets, ALICE, ALICE);

        assertEq(vault.reservedLiabilities(), 30 * ONE_TUSD);
        assertEq(vault.grossAssets(), 50 * ONE_TUSD);
        assertEq(vault.safetyBuffer(), 10 * ONE_TUSD);
        assertEq(vault.freeLiquidity(), 10 * ONE_TUSD);
    }

    function testStandardWithdrawEventReconstructsDelegatedWithdrawal() public {
        vm.prank(ALICE);
        vault.deposit(100 * ONE_TUSD, ALICE);

        uint256 assets = vault.maxWithdraw(ALICE);
        uint256 shares = vault.previewWithdraw(assets);

        vm.expectEmit(true, true, true, true, address(vault));
        emit IERC4626.Withdraw(ALICE, CAROL, ALICE, assets, shares);

        vm.prank(ALICE);
        vault.withdraw(assets, CAROL, ALICE);

        assertEq(token.balanceOf(CAROL), assets);
        assertEq(vault.balanceOf(ALICE), 100 * ONE_TUSD - shares);
    }

    function testStandardDepositEventReconstructsDepositForAnotherReceiver() public {
        uint256 assets = 50 * ONE_TUSD;
        uint256 shares = vault.previewDeposit(assets);

        vm.expectEmit(true, true, false, true, address(vault));
        emit IERC4626.Deposit(ALICE, CAROL, assets, shares);

        vm.prank(ALICE);
        vault.deposit(assets, CAROL);

        assertEq(vault.balanceOf(ALICE), 0);
        assertEq(vault.balanceOf(CAROL), shares);
        assertEq(token.balanceOf(ALICE), 1_000 * ONE_TUSD - assets);
    }
}
