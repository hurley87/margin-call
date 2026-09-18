// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {IOracleAdapter} from "../../src/interfaces/IOracleAdapter.sol";
import {MarginCall} from "../../src/MarginCall.sol";
import {V1Config} from "../../src/V1Config.sol";
import {MarginCallTestBase} from "./MarginCallTestBase.sol";

/// @dev RPC-free financed debt accrual, repayment, and zero-debt close.
contract FinancedDebtTest is MarginCallTestBase {
    function test_currentDebtGrowsOverTimeWithoutKeeper() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (,, uint256 principal, uint256 accrued,,) = _position(tokenId);
        assertGt(principal, 0);
        assertEq(accrued, 0);
        assertEq(marginCall.currentDebt(tokenId), principal);

        vm.warp(OPENED_AT + 30 days);
        uint256 debt = marginCall.currentDebt(tokenId);
        assertGt(debt, principal);
        assertEq(debt, principal + _expectedUnaccrued(principal, 30 days));

        (,,, uint256 accruedAfterWarp,,) = _position(tokenId);
        assertEq(accruedAfterWarp, 0, "view accrual must not mutate checkpoint");
    }

    function test_spotDebtStaysZeroAfterWarp() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _open(alice, ONE_NVDAC);
        assertEq(marginCall.currentDebt(tokenId), 0);

        vm.warp(OPENED_AT + V1Config.SECONDS_PER_YEAR);
        assertEq(marginCall.currentDebt(tokenId), 0);
        (,, uint256 principal, uint256 accrued,,) = _position(tokenId);
        assertEq(principal, 0);
        assertEq(accrued, 0);
    }

    function test_partialRepayInterestFirst() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (,, uint256 principal,,,) = _position(tokenId);

        vm.warp(OPENED_AT + V1Config.SECONDS_PER_YEAR);
        uint256 interest = _expectedUnaccrued(principal, V1Config.SECONDS_PER_YEAR);
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

        (,, uint256 principalAfter, uint256 accruedAfter, uint256 lastAccruedAfter,) = _position(tokenId);
        assertEq(principalAfter, principal, "interest-first leaves principal untouched");
        assertEq(accruedAfter, interest - payAmount);
        assertEq(lastAccruedAfter, OPENED_AT + V1Config.SECONDS_PER_YEAR);
        assertEq(marginCall.currentDebt(tokenId), principal + accruedAfter);
        assertEq(pool.availableCredit(), poolBefore + payAmount);
        assertEq(usdc.balanceOf(alice), aliceUsdcBefore - payAmount);
        assertEq(usdc.balanceOf(address(marginCall)), 0);
    }

    function test_exactFullRepayZerosDebt() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (,, uint256 principal,,,) = _position(tokenId);

        vm.warp(OPENED_AT + 90 days);
        uint256 debt = marginCall.currentDebt(tokenId);
        assertEq(debt, principal + _expectedUnaccrued(principal, 90 days));

        _fundUsdc(alice, debt);
        uint256 poolBefore = pool.availableCredit();

        vm.expectEmit(true, false, false, true, address(marginCall));
        emit MarginCall.DebtRepaid(tokenId, debt);
        vm.prank(alice);
        marginCall.repay(tokenId, debt);

        (,, uint256 principalAfter, uint256 accruedAfter,,) = _position(tokenId);
        assertEq(principalAfter, 0);
        assertEq(accruedAfter, 0);
        assertEq(marginCall.currentDebt(tokenId), 0);
        assertEq(pool.availableCredit(), poolBefore + debt);
        assertEq(usdc.balanceOf(address(marginCall)), 0);
    }

    function test_oversizedRepayCapsAtCurrentDebt() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (,, uint256 principal,,,) = _position(tokenId);

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
        (, uint256 stock,,,,) = _position(tokenId);

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
        (,, uint256 principal,,,) = _position(tokenId);

        assertEq(marginCall.currentDebt(tokenId), principal, "elapsed 0");

        vm.warp(OPENED_AT + 1);
        uint256 oneSecondInterest = _expectedUnaccrued(principal, 1);
        assertEq(marginCall.currentDebt(tokenId), principal + oneSecondInterest);

        vm.warp(OPENED_AT + V1Config.SECONDS_PER_YEAR);
        assertEq(marginCall.currentDebt(tokenId), principal + principal / 10);

        // Checkpoint via a one-unit dust repay. The fixture is deterministic, so year interest is always nonzero.
        assertGt(principal / 10, 0, "fixture must produce nonzero year interest");
        _fundUsdc(alice, 1);
        vm.prank(alice);
        marginCall.repay(tokenId, 1);

        (,, uint256 principalAfter, uint256 accruedAfter, uint256 lastAccruedAfter,) = _position(tokenId);
        assertEq(lastAccruedAfter, OPENED_AT + V1Config.SECONDS_PER_YEAR);
        assertEq(marginCall.currentDebt(tokenId), principalAfter + accruedAfter, "checkpoint matches view");

        // Immediate second repay at the same timestamp must not invent or erase unexpected dust.
        uint256 debtAtCheckpoint = marginCall.currentDebt(tokenId);
        _fundUsdc(alice, debtAtCheckpoint);
        vm.prank(alice);
        marginCall.repay(tokenId, debtAtCheckpoint);
        assertEq(marginCall.currentDebt(tokenId), 0);
        (,, uint256 pFinal, uint256 aFinal,,) = _position(tokenId);
        assertEq(pFinal, 0);
        assertEq(aFinal, 0);
    }

    /// @dev Repeated checkpointing over intervals too short to accrue a whole raw USDC unit floors that remainder
    ///      away instead of carrying it. This pins the behaviour on both sides: no principal is ever erased beyond
    ///      what was actually paid, flooring can only favour the borrower, and the interest that escapes is capped
    ///      at one raw unit per checkpoint — each of which costs a whole `repay` transaction and retires a whole
    ///      raw unit of real debt, because `repay` rejects zero payments.
    function test_repeatedDustCheckpointsCannotEraseDebtBeyondPayment() public {
        _fund(alice, ONE_NVDAC);
        _fund(bob, ONE_NVDAC);
        uint256 idle = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        uint256 churned = _openFinanced(bob, ONE_NVDAC, LEVERAGE_1_25X, 0);

        (,, uint256 principal,,,) = _position(idle);
        // Short enough that this principal accrues strictly less than one raw USDC unit per step.
        uint256 dustInterval = 5;
        assertEq(_expectedUnaccrued(principal, dustInterval), 0, "interval must floor to zero interest");

        uint256 checkpoints = 200;
        _fundUsdc(bob, checkpoints);
        for (uint256 i = 0; i < checkpoints; ++i) {
            vm.warp(block.timestamp + dustInterval);
            vm.prank(bob);
            marginCall.repay(churned, 1);
        }

        (,, uint256 churnedPrincipal, uint256 churnedAccrued,,) = _position(churned);
        assertEq(churnedPrincipal, principal - checkpoints, "principal falls by exactly what was paid, no more");
        assertEq(churnedAccrued, 0, "every dust interval floored to zero interest");

        uint256 idleDebt = marginCall.currentDebt(idle);
        uint256 churnedSettled = marginCall.currentDebt(churned) + checkpoints;
        assertGt(idleDebt, principal, "the untouched twin really did accrue over the same window");
        assertLe(churnedSettled, idleDebt, "checkpointing must never invent debt against the borrower");
        assertLe(idleDebt - churnedSettled, checkpoints, "escaped interest is capped at one raw unit per checkpoint");
    }

    /// @dev The dust window closes as positions grow. Base produces a block every 2s, so 2s is the tightest interval
    ///      a caller can actually checkpoint at, and above roughly 157 USDC of principal even one block accrues a
    ///      whole raw unit — leaving nothing to floor away.
    function test_dustWindowClosesOncePrincipalIsMeaningful() public pure {
        uint256 baseBlockTime = 2;
        uint256 threshold = 157_680_000;
        assertEq(_expectedUnaccrued(threshold - 1, baseBlockTime), 0, "just below, a block still floors to nothing");
        assertEq(_expectedUnaccrued(threshold, baseBlockTime), 1, "at the threshold, one block accrues a raw unit");
    }

    function test_repayAndCloseUnderHeldInvalidAndRevertingOracle() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (, uint256 stock,,,,) = _position(tokenId);

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

        vm.prank(alice);
        marginCall.setExecutor(tokenId, bob);

        _fundUsdc(bob, debt);
        vm.prank(bob);
        marginCall.repay(tokenId, debt);
        assertEq(marginCall.currentDebt(tokenId), 0);
    }
}
