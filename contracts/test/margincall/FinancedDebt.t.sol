// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";

import {IOracleAdapter} from "../../src/interfaces/IOracleAdapter.sol";
import {MarginCall} from "../../src/MarginCall.sol";
import {V1Config} from "../../src/V1Config.sol";
import {MarginCallTestBase} from "./MarginCallTestBase.sol";

/// @dev RPC-free financed debt accrual, repayment, and zero-debt close.
contract FinancedDebtTest is MarginCallTestBase {
    using stdStorage for StdStorage;

    function test_currentDebtGrowsOverTimeWithoutKeeper() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (, uint256 principal, uint256 accrued,,) = _position(tokenId);
        assertGt(principal, 0);
        assertEq(accrued, 0);
        assertEq(marginCall.currentDebt(tokenId), principal);

        vm.warp(OPENED_AT + 30 days);
        uint256 debt = marginCall.currentDebt(tokenId);
        assertGt(debt, principal);
        assertEq(debt, principal + _expectedUnaccrued(principal, 30 days));

        (,, uint256 accruedAfterWarp,,) = _position(tokenId);
        assertEq(accruedAfterWarp, 0, "view accrual must not mutate checkpoint");
    }

    function test_spotDebtStaysZeroAfterWarp() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _open(alice, ONE_NVDAC);
        assertEq(marginCall.currentDebt(tokenId), 0);

        vm.warp(OPENED_AT + 365 days);
        assertEq(marginCall.currentDebt(tokenId), 0);
        (, uint256 principal, uint256 accrued,,) = _position(tokenId);
        assertEq(principal, 0);
        assertEq(accrued, 0);
    }

    function test_partialRepayInterestFirst() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (, uint256 principal,,,) = _position(tokenId);

        vm.warp(OPENED_AT + 365 days);
        uint256 interest = _expectedUnaccrued(principal, 365 days);
        assertEq(interest, principal / 10, "one year at 10% floors to exactly 10% of principal");
        assertEq(marginCall.currentDebt(tokenId), principal + interest);

        uint256 payAmount = interest / 2;
        assertGt(payAmount, 0);
        _fundUsdc(alice, payAmount);

        uint256 poolBefore = pool.availableCredit();
        uint256 aliceUsdcBefore = usdc.balanceOf(alice);

        vm.expectEmit(true, false, false, true, address(marginCall));
        emit MarginCall.DebtRepaid(tokenId, payAmount);
        vm.prank(alice);
        marginCall.repay(tokenId, payAmount);

        (, uint256 principalAfter, uint256 accruedAfter, uint256 lastAccruedAfter,) = _position(tokenId);
        assertEq(principalAfter, principal, "interest-first leaves principal untouched");
        assertEq(accruedAfter, interest - payAmount);
        assertEq(lastAccruedAfter, OPENED_AT + 365 days);
        assertEq(marginCall.currentDebt(tokenId), principal + accruedAfter);
        assertEq(pool.availableCredit(), poolBefore + payAmount);
        assertEq(usdc.balanceOf(alice), aliceUsdcBefore - payAmount);
        assertEq(usdc.balanceOf(address(marginCall)), 0);
    }

    function test_exactFullRepayZerosDebt() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (, uint256 principal,,,) = _position(tokenId);

        vm.warp(OPENED_AT + 90 days);
        uint256 debt = marginCall.currentDebt(tokenId);
        assertEq(debt, principal + _expectedUnaccrued(principal, 90 days));

        _fundUsdc(alice, debt);
        uint256 poolBefore = pool.availableCredit();

        vm.expectEmit(true, false, false, true, address(marginCall));
        emit MarginCall.DebtRepaid(tokenId, debt);
        vm.prank(alice);
        marginCall.repay(tokenId, debt);

        (, uint256 principalAfter, uint256 accruedAfter,,) = _position(tokenId);
        assertEq(principalAfter, 0);
        assertEq(accruedAfter, 0);
        assertEq(marginCall.currentDebt(tokenId), 0);
        assertEq(pool.availableCredit(), poolBefore + debt);
        assertEq(usdc.balanceOf(address(marginCall)), 0);
    }

    function test_oversizedRepayCapsAtCurrentDebt() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (, uint256 principal,,,) = _position(tokenId);

        vm.warp(OPENED_AT + 10 days);
        uint256 debt = marginCall.currentDebt(tokenId);
        assertGt(debt, principal);

        uint256 oversized = debt + 1_000e6;
        _fundUsdc(alice, oversized);
        uint256 aliceUsdcBefore = usdc.balanceOf(alice);
        uint256 poolBefore = pool.availableCredit();

        vm.expectEmit(true, false, false, true, address(marginCall));
        emit MarginCall.DebtRepaid(tokenId, debt);
        vm.prank(alice);
        marginCall.repay(tokenId, oversized);

        assertEq(marginCall.currentDebt(tokenId), 0);
        assertEq(usdc.balanceOf(alice), aliceUsdcBefore - debt, "excess never leaves the caller");
        assertEq(pool.availableCredit(), poolBefore + debt);
        assertEq(usdc.balanceOf(address(marginCall)), 0, "no residual USDC on MarginCall");
    }

    function test_closeRevertsWhileDebtOutstandingThenSucceedsAfterRepay() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (uint256 stock,,,,) = _position(tokenId);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.DebtOutstanding.selector, tokenId));
        vm.prank(alice);
        marginCall.closePosition(tokenId);

        vm.warp(OPENED_AT + 7 days);
        uint256 debt = marginCall.currentDebt(tokenId);
        _fundUsdc(alice, debt);
        vm.prank(alice);
        marginCall.repay(tokenId, debt);
        assertEq(marginCall.currentDebt(tokenId), 0);

        vm.expectEmit(true, true, false, true, address(marginCall));
        emit MarginCall.PositionClosed(tokenId, alice, stock);
        vm.prank(alice);
        marginCall.closePosition(tokenId);

        _assertTokenDoesNotExist(tokenId);
        _assertPositionDeleted(tokenId);
        assertEq(nvdac.balanceOf(alice), stock);
        assertEq(nvdac.balanceOf(address(marginCall)), 0);
    }

    function test_unauthorizedAndApprovedCannotRepay() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        vm.warp(OPENED_AT + 1 days);
        uint256 debt = marginCall.currentDebt(tokenId);
        _fundUsdc(bob, debt);
        _fundUsdc(carol, debt);

        vm.prank(alice);
        marginCall.approve(bob, tokenId);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionManager.selector, bob, alice, address(0)));
        vm.prank(bob);
        marginCall.repay(tokenId, debt);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionManager.selector, carol, alice, address(0)));
        vm.prank(carol);
        marginCall.repay(tokenId, debt);
    }

    function test_zeroRepaymentReverts() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);

        vm.expectRevert(MarginCall.ZeroRepayment.selector);
        vm.prank(alice);
        marginCall.repay(tokenId, 0);

        uint256 debt = marginCall.currentDebt(tokenId);
        _fundUsdc(alice, debt);
        vm.prank(alice);
        marginCall.repay(tokenId, debt);
        assertEq(marginCall.currentDebt(tokenId), 0);

        vm.expectRevert(MarginCall.ZeroRepayment.selector);
        vm.prank(alice);
        marginCall.repay(tokenId, 1);
    }

    function test_timeBoundaryRoundingAndRepeatedCheckpoint() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (, uint256 principal,,,) = _position(tokenId);

        assertEq(marginCall.currentDebt(tokenId), principal, "elapsed 0");

        vm.warp(OPENED_AT + 1);
        uint256 oneSecondInterest = _expectedUnaccrued(principal, 1);
        assertEq(marginCall.currentDebt(tokenId), principal + oneSecondInterest);

        vm.warp(OPENED_AT + 365 days);
        assertEq(marginCall.currentDebt(tokenId), principal + principal / 10);

        // Checkpoint via a dust repay equal to one unit of interest (or 1 wei if year interest is large).
        uint256 yearInterest = principal / 10;
        uint256 dust = yearInterest > 0 ? 1 : 0;
        if (dust == 0) {
            // Pathological tiny principal: still prove checkpoint does not invent debt.
            _fundUsdc(alice, 1);
            vm.prank(alice);
            marginCall.repay(tokenId, type(uint256).max);
            assertEq(marginCall.currentDebt(tokenId), 0);
            return;
        }

        _fundUsdc(alice, dust);
        vm.prank(alice);
        marginCall.repay(tokenId, dust);

        (, uint256 principalAfter, uint256 accruedAfter, uint256 lastAccruedAfter,) = _position(tokenId);
        assertEq(lastAccruedAfter, OPENED_AT + 365 days);
        assertEq(marginCall.currentDebt(tokenId), principalAfter + accruedAfter, "checkpoint matches view");

        // Immediate second repay at the same timestamp must not invent or erase unexpected dust.
        uint256 debtAtCheckpoint = marginCall.currentDebt(tokenId);
        _fundUsdc(alice, debtAtCheckpoint);
        vm.prank(alice);
        marginCall.repay(tokenId, debtAtCheckpoint);
        assertEq(marginCall.currentDebt(tokenId), 0);
        (, uint256 pFinal, uint256 aFinal,,) = _position(tokenId);
        assertEq(pFinal, 0);
        assertEq(aFinal, 0);
    }

    function test_repayAndCloseUnderHeldInvalidAndRevertingOracle() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (uint256 stock,,,,) = _position(tokenId);

        vm.warp(OPENED_AT + 14 days);
        uint256 debt = marginCall.currentDebt(tokenId);
        assertGt(debt, 0);

        oracle.setState(IOracleAdapter.State.HELD);
        assertEq(marginCall.currentDebt(tokenId), debt, "HELD does not change time debt");

        uint256 half = debt / 2;
        _fundUsdc(alice, half);
        vm.prank(alice);
        marginCall.repay(tokenId, half);

        oracle.setState(IOracleAdapter.State.INVALID);
        uint256 remaining = marginCall.currentDebt(tokenId);
        assertGt(remaining, 0);
        _fundUsdc(alice, remaining);
        vm.prank(alice);
        marginCall.repay(tokenId, remaining);
        assertEq(marginCall.currentDebt(tokenId), 0);

        oracle.setShouldRevert(true);
        // currentDebt must not touch the oracle; repay already cleared debt.
        assertEq(marginCall.currentDebt(tokenId), 0);
        vm.prank(alice);
        marginCall.closePosition(tokenId);
        _assertTokenDoesNotExist(tokenId);
        assertEq(nvdac.balanceOf(alice), stock);
    }

    function test_executorCanRepay() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        vm.warp(OPENED_AT + 5 days);
        uint256 debt = marginCall.currentDebt(tokenId);

        // Slice 4 owns setExecutor; plant the field so repay's manager check is covered here.
        _setExecutor(tokenId, bob);

        _fundUsdc(bob, debt);
        vm.prank(bob);
        marginCall.repay(tokenId, debt);
        assertEq(marginCall.currentDebt(tokenId), 0);
    }

    /// @dev Mirror of `MarginCall._unaccruedInterest`.
    function _expectedUnaccrued(uint256 principal, uint256 elapsed) internal pure returns (uint256) {
        return Math.mulDiv(
            principal,
            V1Config.BORROW_APR_BPS * elapsed,
            V1Config.BPS_DENOMINATOR * V1Config.SECONDS_PER_YEAR,
            Math.Rounding.Floor
        );
    }

    function _fundUsdc(address user, uint256 amount) internal {
        usdc.mint(user, amount);
        vm.prank(user);
        usdc.approve(address(marginCall), type(uint256).max);
    }

    /// @dev Write `positions[tokenId].executor` without a public setter (Slice 4).
    function _setExecutor(uint256 tokenId, address executor) internal {
        stdstore.target(address(marginCall)).sig("positions(uint256)").with_key(tokenId).depth(4)
            .checked_write(executor);
        (,,,, address stored) = _position(tokenId);
        assertEq(stored, executor, "executor plant failed");
    }
}
