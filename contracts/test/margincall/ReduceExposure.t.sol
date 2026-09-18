// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IOracleAdapter} from "../../src/interfaces/IOracleAdapter.sol";
import {MarginCall} from "../../src/MarginCall.sol";
import {V1Config} from "../../src/V1Config.sol";
import {BaseV1Constants} from "../fixtures/BaseV1Constants.sol";
import {MarginCallTestBase} from "./MarginCallTestBase.sol";

/// @dev RPC-free exact-input deleveraging: sell NVDAc, repay interest then principal, surplus to owner.
contract ReduceExposureTest is MarginCallTestBase {
    /// @dev Small sale relative to a 1 NVDAc contribution + financed buy.
    uint256 internal constant SMALL_SALE = ONE_NVDAC / 10;

    function test_ownerReduceExposureSellsExactStockAndRepaysPool() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        MarginCall.Position memory pos = _position(tokenId);
        uint256 stockBefore = pos.stockAmount;
        uint256 principalBefore = pos.principal;
        assertGt(stockBefore, ONE_NVDAC);
        assertGt(principalBefore, 0);
        assertTrue(SMALL_SALE > 0 && SMALL_SALE < stockBefore);

        uint256 poolBefore = pool.availableCredit();
        uint256 custodyBefore = nvdac.balanceOf(address(marginCall));
        uint256 expectedUsdcOut = _expectedSellOut(SMALL_SALE);
        uint256 repayAmount = Math.min(expectedUsdcOut, principalBefore);

        vm.expectEmit(true, false, false, true, address(marginCall));
        emit MarginCall.DebtRepaid(tokenId, repayAmount);
        vm.expectEmit(true, false, false, true, address(marginCall));
        emit MarginCall.ExposureReduced(tokenId, SMALL_SALE, expectedUsdcOut);

        vm.prank(alice);
        marginCall.reduceExposure(tokenId, SMALL_SALE, 0);

        pos = _position(tokenId);
        uint256 stockAfter = pos.stockAmount;
        uint256 principalAfter = pos.principal;
        uint256 accruedAfter = pos.accruedInterest;
        assertEq(stockAfter, stockBefore - SMALL_SALE, "exact stock sold");
        assertEq(accruedAfter, 0, "no accrued interest yet");
        assertEq(principalAfter, principalBefore - repayAmount);
        assertEq(nvdac.balanceOf(address(marginCall)), custodyBefore - SMALL_SALE);
        assertEq(pool.availableCredit(), poolBefore + repayAmount);
        assertEq(usdc.balanceOf(address(marginCall)), 0, "no residual USDC on MarginCall");
        if (expectedUsdcOut > repayAmount) {
            assertEq(usdc.balanceOf(alice), expectedUsdcOut - repayAmount, "surplus to owner");
        }
    }

    function test_executorCanReduceExposure() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        uint256 stockBefore = _position(tokenId).stockAmount;

        vm.prank(alice);
        marginCall.setExecutor(tokenId, bob);

        vm.prank(bob);
        marginCall.reduceExposure(tokenId, SMALL_SALE, 0);

        uint256 stockAfter = _position(tokenId).stockAmount;
        assertEq(stockAfter, stockBefore - SMALL_SALE);
        assertEq(marginCall.ownerOf(tokenId), alice);
    }

    function test_unauthorizedApprovedAndOperatorCannotReduceExposure() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);

        vm.prank(alice);
        marginCall.approve(bob, tokenId);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionManager.selector, bob, alice, address(0)));
        vm.prank(bob);
        marginCall.reduceExposure(tokenId, SMALL_SALE, 0);

        vm.prank(alice);
        marginCall.approve(address(0), tokenId);
        vm.prank(alice);
        marginCall.setApprovalForAll(carol, true);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionManager.selector, carol, alice, address(0)));
        vm.prank(carol);
        marginCall.reduceExposure(tokenId, SMALL_SALE, 0);

        address outsider = makeAddr("outsider");
        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionManager.selector, outsider, alice, address(0)));
        vm.prank(outsider);
        marginCall.reduceExposure(tokenId, SMALL_SALE, 0);
    }

    function test_zeroAndExcessStockRevert() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        uint256 stock = _position(tokenId).stockAmount;

        vm.expectRevert(MarginCall.ZeroStockAmount.selector);
        vm.prank(alice);
        marginCall.reduceExposure(tokenId, 0, 0);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.ExcessStockAmount.selector, stock + 1, stock));
        vm.prank(alice);
        marginCall.reduceExposure(tokenId, stock + 1, 0);

        uint256 stockAfter = _position(tokenId).stockAmount;
        assertEq(stockAfter, stock);
    }

    function test_reduceExposureDoesNotConsumeOtherPositionStock() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenA = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        _fund(bob, ONE_NVDAC);
        uint256 tokenB = _openFinanced(bob, ONE_NVDAC, LEVERAGE_1_25X, 0);

        uint256 stockABefore = _position(tokenA).stockAmount;
        uint256 stockBBefore = _position(tokenB).stockAmount;
        uint256 custodyBefore = nvdac.balanceOf(address(marginCall));

        vm.prank(alice);
        marginCall.reduceExposure(tokenA, SMALL_SALE, 0);

        uint256 stockAAfter = _position(tokenA).stockAmount;
        uint256 stockBAfter = _position(tokenB).stockAmount;
        assertEq(stockAAfter, stockABefore - SMALL_SALE);
        assertEq(stockBAfter, stockBBefore, "other position untouched");
        assertEq(nvdac.balanceOf(address(marginCall)), custodyBefore - SMALL_SALE);
    }

    function test_heldInvalidAndRevertingOracleBlockReduceButNotRepayTransferOrClose() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        uint256 stock = _position(tokenId).stockAmount;

        vm.warp(OPENED_AT + 14 days);
        uint256 debt = marginCall.currentDebt(tokenId);
        assertGt(debt, 0);

        oracle.setState(IOracleAdapter.State.HELD);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.OracleNotLive.selector, IOracleAdapter.State.HELD));
        vm.prank(alice);
        marginCall.reduceExposure(tokenId, SMALL_SALE, 0);

        // External repay remains available under HELD.
        uint256 half = debt / 2;
        _fundUsdc(alice, half);
        vm.prank(alice);
        marginCall.repay(tokenId, half);

        oracle.setState(IOracleAdapter.State.INVALID);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.OracleNotLive.selector, IOracleAdapter.State.INVALID));
        vm.prank(alice);
        marginCall.reduceExposure(tokenId, SMALL_SALE, 0);

        // Executor update and transfer remain available.
        vm.prank(alice);
        marginCall.setExecutor(tokenId, bob);
        address executor = _position(tokenId).executor;
        assertEq(executor, bob);

        vm.prank(alice);
        marginCall.transferFrom(alice, carol, tokenId);
        assertEq(marginCall.ownerOf(tokenId), carol);
        executor = _position(tokenId).executor;
        assertEq(executor, address(0));

        // Finish with external repay + debt-free close under reverting oracle.
        uint256 remaining = marginCall.currentDebt(tokenId);
        _fundUsdc(carol, remaining);
        oracle.setShouldRevert(true);
        vm.prank(carol);
        marginCall.repay(tokenId, remaining);
        assertEq(marginCall.currentDebt(tokenId), 0);

        uint256 stockLeft = _position(tokenId).stockAmount;
        assertEq(stockLeft, stock);
        vm.prank(carol);
        marginCall.closePosition(tokenId);
        _assertTokenDoesNotExist(tokenId);
        assertEq(nvdac.balanceOf(carol), stock);
    }

    function test_interestFirstPartialThenFullDebtClearance() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        uint256 principal = _position(tokenId).principal;

        vm.warp(OPENED_AT + V1Config.SECONDS_PER_YEAR);
        uint256 interest = _expectedUnaccrued(principal, V1Config.SECONDS_PER_YEAR);
        assertEq(interest, principal / 10);
        assertEq(marginCall.currentDebt(tokenId), principal + interest);

        // Size a sale that pays only part of accrued interest.
        uint256 saleForHalfInterest = _stockForUsdcOut(interest / 2);
        assertGt(saleForHalfInterest, 0);
        uint256 usdcOut = _expectedSellOut(saleForHalfInterest);
        assertLe(usdcOut, interest);

        vm.prank(alice);
        marginCall.reduceExposure(tokenId, saleForHalfInterest, 0);

        MarginCall.Position memory pos = _position(tokenId);
        uint256 principalAfter = pos.principal;
        uint256 accruedAfter = pos.accruedInterest;
        assertEq(principalAfter, principal, "interest-first leaves principal");
        assertEq(accruedAfter, interest - usdcOut);
        assertEq(marginCall.currentDebt(tokenId), principal + accruedAfter);

        // Sell enough remaining stock to clear all debt (with surplus possible).
        uint256 stockLeft = _position(tokenId).stockAmount;
        uint256 debtLeft = marginCall.currentDebt(tokenId);
        // Buffer for the ceil fill, capped at the stock actually left.
        uint256 saleToClear = Math.min(_stockForUsdcOut(debtLeft + debtLeft / 10), stockLeft);
        uint256 aliceUsdcBefore = usdc.balanceOf(alice);
        uint256 poolBefore = pool.availableCredit();

        vm.prank(alice);
        marginCall.reduceExposure(tokenId, saleToClear, 0);

        assertEq(marginCall.currentDebt(tokenId), 0);
        assertEq(pool.availableCredit(), poolBefore + debtLeft);
        assertGe(usdc.balanceOf(alice), aliceUsdcBefore, "any surplus stays with owner");
        assertEq(usdc.balanceOf(address(marginCall)), 0);
    }

    function test_surplusGoesToOwnerNotExecutor() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        MarginCall.Position memory pos = _position(tokenId);
        uint256 stock = pos.stockAmount;
        uint256 principal = pos.principal;

        vm.prank(alice);
        marginCall.setExecutor(tokenId, bob);

        // Sell enough to exceed principal (no accrual yet).
        uint256 sale = Math.min(_stockForUsdcOut(principal + 1e6), stock);
        uint256 usdcOut = _expectedSellOut(sale);
        assertGt(usdcOut, principal);

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore = usdc.balanceOf(bob);
        uint256 poolBefore = pool.availableCredit();

        vm.prank(bob);
        marginCall.reduceExposure(tokenId, sale, 0);

        assertEq(marginCall.currentDebt(tokenId), 0);
        assertEq(pool.availableCredit(), poolBefore + principal);
        assertEq(usdc.balanceOf(alice), aliceBefore + (usdcOut - principal), "surplus to NFT owner");
        assertEq(usdc.balanceOf(bob), bobBefore, "executor receives no surplus");
        assertEq(usdc.balanceOf(address(marginCall)), 0);
    }

    function test_spotReduceExposureSendsAllProceedsToOwner() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _open(alice, ONE_NVDAC);
        assertEq(marginCall.currentDebt(tokenId), 0);

        uint256 sale = ONE_NVDAC / 4;
        uint256 usdcOut = _expectedSellOut(sale);
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 poolBefore = pool.availableCredit();

        vm.prank(alice);
        marginCall.reduceExposure(tokenId, sale, 0);

        uint256 stockAfter = _position(tokenId).stockAmount;
        assertEq(stockAfter, ONE_NVDAC - sale);
        assertEq(usdc.balanceOf(alice), aliceBefore + usdcOut);
        assertEq(pool.availableCredit(), poolBefore, "spot has no debt to repay");
        assertEq(usdc.balanceOf(address(marginCall)), 0);
    }

    function test_tightMinOutAndRouterRevertRollBackAtomically() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        Snapshot memory before_ = _snapshot(tokenId);

        uint256 fill = _expectedSellOut(SMALL_SALE);
        vm.expectRevert(bytes("Too little received"));
        vm.prank(alice);
        marginCall.reduceExposure(tokenId, SMALL_SALE, fill + 1);
        _assertSnapshot(tokenId, before_);

        router.setShouldRevert(true);
        vm.expectRevert();
        vm.prank(alice);
        marginCall.reduceExposure(tokenId, SMALL_SALE, 0);
        _assertSnapshot(tokenId, before_);

        router.setShouldRevert(false);
        oracle.setShouldRevert(true);
        vm.expectRevert();
        vm.prank(alice);
        marginCall.reduceExposure(tokenId, SMALL_SALE, 0);
        oracle.setShouldRevert(false);
        _assertSnapshot(tokenId, before_);
    }

    /// @dev Invert `_expectedSellOut`: smallest stock whose fill covers `targetUsdc`.
    function _stockForUsdcOut(uint256 targetUsdc) internal pure returns (uint256) {
        if (targetUsdc == 0) {
            return 0;
        }
        // Ceil inversion of a ceil fill, so the result may overshoot the target by one raw unit.
        return Math.mulDiv(
            targetUsdc,
            V1Config.VALUATION_DENOMINATOR * BaseV1Constants.BPS_DENOMINATOR,
            BaseV1Constants.PINNED_FEED_ANSWER * V1Config.ADVERSE_BOUND_BPS,
            Math.Rounding.Ceil
        );
    }
}
