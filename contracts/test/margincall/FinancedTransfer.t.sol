// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {IOracleAdapter} from "../../src/interfaces/IOracleAdapter.sol";
import {MarginCall} from "../../src/MarginCall.sol";
import {V1Config} from "../../src/V1Config.sol";
import {MarginCallTestBase} from "./MarginCallTestBase.sol";
import {ExecutorRepayCaller, TransferCallbackExecutorGuard} from "./PositionNftTestDoubles.sol";

/// @dev Financed Position NFT transfer: accounting preservation, oracle independence, and executor clearing.
contract FinancedTransferTest is MarginCallTestBase {
    function test_financedTransferPreservesDebtAndClearsExecutorAuthority() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        vm.warp(OPENED_AT + 10 days);

        vm.prank(alice);
        marginCall.setExecutor(tokenId, bob);

        uint256 debtBefore = marginCall.currentDebt(tokenId);
        uint256 partialPay = debtBefore / 4;
        _fundUsdc(bob, partialPay);
        vm.prank(bob);
        marginCall.repay(tokenId, partialPay);

        (
            uint256 stockBefore,
            uint256 principalBefore,
            uint256 accruedBefore,
            uint256 lastAccruedBefore,
            address executorBefore
        ) = _position(tokenId);
        assertEq(executorBefore, bob);
        assertGt(principalBefore + accruedBefore, 0);
        uint256 debtAfterRepay = marginCall.currentDebt(tokenId);

        _expectNoOracleCalls();
        vm.prank(alice);
        marginCall.transferFrom(alice, carol, tokenId);

        assertEq(marginCall.ownerOf(tokenId), carol);
        _assertAccountingUnchanged(
            tokenId, stockBefore, principalBefore, accruedBefore, lastAccruedBefore, debtAfterRepay
        );
        (,,,, address executorAfter) = _position(tokenId);
        assertEq(executorAfter, address(0));

        _assertAliceAndBobLoseManagement(tokenId, carol);
        _assertCarolGainsOwnerControl(tokenId);
    }

    function test_transferUnderHealthyLivePricing() public {
        uint256 tokenId = _openFinancedWithExecutorAndAccrual();
        (uint256 stock,,,,) = _position(tokenId);
        uint256 nav = oracle.valueUsdc(stock, oracle.price());
        uint256 debt = marginCall.currentDebt(tokenId);
        assertTrue(_isHealthy(nav, debt), "fixture should be healthy at open price");

        _expectNoOracleCalls();
        vm.prank(alice);
        marginCall.transferFrom(alice, carol, tokenId);

        assertEq(marginCall.ownerOf(tokenId), carol);
        (,,,, address executor) = _position(tokenId);
        assertEq(executor, address(0));
    }

    function test_transferUnderLiquidatableLivePricing() public {
        uint256 tokenId = _openFinancedWithExecutorAndAccrual();
        (uint256 stock,,,,) = _position(tokenId);
        uint256 debt = marginCall.currentDebt(tokenId);

        // Crash price so equity is still positive but health factor < 1.0
        // (equity / nav < maintenance 30%  <=>  debt / nav > 70%).
        uint256 liquidatablePrice = _priceForDebtShare(stock, debt, 7_500);
        oracle.setObservation(IOracleAdapter.State.LIVE, liquidatablePrice, 2, block.timestamp);
        uint256 nav = oracle.valueUsdc(stock, liquidatablePrice);
        assertTrue(_isLiquidatable(nav, debt), "fixture should be liquidatable");
        assertGt(nav, debt, "fixture should still have positive equity");

        _expectNoOracleCalls();
        vm.prank(alice);
        marginCall.transferFrom(alice, carol, tokenId);

        assertEq(marginCall.ownerOf(tokenId), carol);
        (,,,, address executor) = _position(tokenId);
        assertEq(executor, address(0));
        assertEq(marginCall.currentDebt(tokenId), debt);
    }

    function test_transferUnderUnderwaterLivePricing() public {
        uint256 tokenId = _openFinancedWithExecutorAndAccrual();
        (uint256 stock,,,,) = _position(tokenId);
        uint256 debt = marginCall.currentDebt(tokenId);

        uint256 underwaterPrice = _priceForDebtShare(stock, debt, 11_000);
        oracle.setObservation(IOracleAdapter.State.LIVE, underwaterPrice, 3, block.timestamp);
        uint256 nav = oracle.valueUsdc(stock, underwaterPrice);
        assertTrue(debt >= nav, "fixture should be underwater");

        _expectNoOracleCalls();
        vm.prank(alice);
        marginCall.transferFrom(alice, carol, tokenId);

        assertEq(marginCall.ownerOf(tokenId), carol);
        (,,,, address executor) = _position(tokenId);
        assertEq(executor, address(0));
        assertEq(marginCall.currentDebt(tokenId), debt);
    }

    function test_transferUnderHeldInvalidAndRevertingOracle() public {
        uint256 tokenId = _openFinancedWithExecutorAndAccrual();
        (uint256 stock, uint256 principal, uint256 accrued, uint256 lastAccrued,) = _position(tokenId);
        uint256 debt = marginCall.currentDebt(tokenId);

        // Each state proves transfer availability without a financial/oracle gate. Per-hop
        // `expectCall(0)` is covered by the dedicated single-transfer tests below; Foundry only
        // allows one counted expectCall per selector per test, so this multi-hop path asserts
        // success + accounting preservation instead.
        oracle.setState(IOracleAdapter.State.HELD);
        vm.prank(alice);
        marginCall.transferFrom(alice, bob, tokenId);
        assertEq(marginCall.ownerOf(tokenId), bob);
        _assertAccountingUnchanged(tokenId, stock, principal, accrued, lastAccrued, debt);

        vm.prank(bob);
        marginCall.setExecutor(tokenId, alice);

        oracle.setState(IOracleAdapter.State.INVALID);
        vm.prank(bob);
        marginCall.transferFrom(bob, carol, tokenId);
        assertEq(marginCall.ownerOf(tokenId), carol);
        (,,,, address executor) = _position(tokenId);
        assertEq(executor, address(0));
        _assertAccountingUnchanged(tokenId, stock, principal, accrued, lastAccrued, debt);

        vm.prank(carol);
        marginCall.setExecutor(tokenId, bob);

        oracle.setShouldRevert(true);
        vm.prank(carol);
        marginCall.transferFrom(carol, alice, tokenId);
        assertEq(marginCall.ownerOf(tokenId), alice);
        (,,,, executor) = _position(tokenId);
        assertEq(executor, address(0));
        _assertAccountingUnchanged(tokenId, stock, principal, accrued, lastAccrued, debt);
    }

    function test_transferUnderHeldOracleMakesNoOracleCall() public {
        uint256 tokenId = _openFinancedWithExecutorAndAccrual();
        uint256 debt = marginCall.currentDebt(tokenId);
        oracle.setState(IOracleAdapter.State.HELD);

        _assertTransferIgnoresOracle(tokenId, debt);
    }

    function test_transferUnderInvalidOracleMakesNoOracleCall() public {
        uint256 tokenId = _openFinancedWithExecutorAndAccrual();
        uint256 debt = marginCall.currentDebt(tokenId);
        oracle.setState(IOracleAdapter.State.INVALID);

        _assertTransferIgnoresOracle(tokenId, debt);
    }

    function test_transferUnderRevertingOracleMakesNoOracleCall() public {
        uint256 tokenId = _openFinancedWithExecutorAndAccrual();
        uint256 debt = marginCall.currentDebt(tokenId);
        oracle.setShouldRevert(true);

        _assertTransferIgnoresOracle(tokenId, debt);
    }

    function test_safeTransferClearsExecutorBeforeReceiverCallback() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        vm.warp(OPENED_AT + 7 days);

        ExecutorRepayCaller staleExecutor = new ExecutorRepayCaller(marginCall, usdc);
        TransferCallbackExecutorGuard receiver = new TransferCallbackExecutorGuard(marginCall, staleExecutor);

        vm.prank(alice);
        marginCall.setExecutor(tokenId, address(staleExecutor));

        (uint256 stockBefore, uint256 principalBefore, uint256 accruedBefore, uint256 lastAccruedBefore,) =
            _position(tokenId);
        uint256 debt = marginCall.currentDebt(tokenId);
        assertGt(debt, 0);
        _fundUsdc(address(staleExecutor), debt);

        vm.prank(alice);
        marginCall.safeTransferFrom(alice, address(receiver), tokenId);

        assertTrue(receiver.sawClearedExecutor(), "executor must be cleared inside callback");
        assertEq(receiver.observedExecutor(), address(0));
        assertEq(receiver.observedOwner(), address(receiver));
        assertTrue(receiver.sawStaleRepayRevert(), "stale executor repay must fail in callback");
        assertEq(
            receiver.staleRepayRevertData(),
            abi.encodeWithSelector(
                MarginCall.NotPositionManager.selector, address(staleExecutor), address(receiver), address(0)
            )
        );

        assertEq(marginCall.ownerOf(tokenId), address(receiver));
        (,,,, address executor) = _position(tokenId);
        assertEq(executor, address(0));
        _assertAccountingUnchanged(tokenId, stockBefore, principalBefore, accruedBefore, lastAccruedBefore, debt);

        // After the transfer returns, the stale executor still cannot manage the position.
        vm.expectRevert(
            abi.encodeWithSelector(
                MarginCall.NotPositionManager.selector, address(staleExecutor), address(receiver), address(0)
            )
        );
        vm.prank(address(staleExecutor));
        marginCall.repay(tokenId, debt);

        vm.expectRevert(
            abi.encodeWithSelector(MarginCall.NotPositionOwner.selector, address(staleExecutor), address(receiver))
        );
        vm.prank(address(staleExecutor));
        marginCall.setExecutor(tokenId, alice);
    }

    function test_mintAndBurnLeaveNoExecutorState() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (,,,, address executorAtMint) = _position(tokenId);
        assertEq(executorAtMint, address(0));

        vm.prank(alice);
        marginCall.setExecutor(tokenId, bob);
        (,,,, address executorSet) = _position(tokenId);
        assertEq(executorSet, bob);

        uint256 debt = marginCall.currentDebt(tokenId);
        _fundUsdc(alice, debt);
        vm.prank(alice);
        marginCall.repay(tokenId, debt);

        (uint256 stock,,,,) = _position(tokenId);
        vm.prank(alice);
        marginCall.closePosition(tokenId);
        _assertTokenDoesNotExist(tokenId);
        _assertPositionDeleted(tokenId);
        assertEq(nvdac.balanceOf(alice), stock);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _openFinancedWithExecutorAndAccrual() internal returns (uint256 tokenId) {
        _fund(alice, ONE_NVDAC);
        tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        vm.warp(OPENED_AT + 10 days);
        vm.prank(alice);
        marginCall.setExecutor(tokenId, bob);
    }

    function _expectNoOracleCalls() internal {
        vm.expectCall(address(oracle), abi.encodeWithSelector(IOracleAdapter.latestObservation.selector), 0);
        vm.expectCall(address(oracle), abi.encodeWithSelector(IOracleAdapter.refresh.selector), 0);
        // valueUsdc is pure on the mock; still assert the selector is never called from transfer.
        vm.expectCall(address(oracle), abi.encodeWithSelector(IOracleAdapter.valueUsdc.selector), 0);
    }

    /// @dev Shared body for the single-hop "transfer never consults the oracle" cases. The caller puts the
    ///      oracle into the state under test after reading `debt`, so the read itself stays oracle-independent.
    function _assertTransferIgnoresOracle(uint256 tokenId, uint256 debt) internal {
        _expectNoOracleCalls();
        vm.prank(alice);
        marginCall.transferFrom(alice, carol, tokenId);

        assertEq(marginCall.ownerOf(tokenId), carol);
        assertEq(marginCall.currentDebt(tokenId), debt);
        (,,,, address executor) = _position(tokenId);
        assertEq(executor, address(0));
    }

    function _assertAccountingUnchanged(
        uint256 tokenId,
        uint256 stock,
        uint256 principal,
        uint256 accrued,
        uint256 lastAccrued,
        uint256 debt
    ) internal view {
        (uint256 s, uint256 p, uint256 a, uint256 t,) = _position(tokenId);
        assertEq(s, stock);
        assertEq(p, principal);
        assertEq(a, accrued);
        assertEq(t, lastAccrued);
        assertEq(marginCall.currentDebt(tokenId), debt);
    }

    function _assertAliceAndBobLoseManagement(uint256 tokenId, address newOwner) internal {
        uint256 debt = marginCall.currentDebt(tokenId);
        uint256 sale = ONE_NVDAC / 20;

        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionManager.selector, alice, newOwner, address(0)));
        vm.prank(alice);
        marginCall.repay(tokenId, debt);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionManager.selector, bob, newOwner, address(0)));
        vm.prank(bob);
        marginCall.repay(tokenId, debt);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionManager.selector, alice, newOwner, address(0)));
        vm.prank(alice);
        marginCall.reduceExposure(tokenId, sale, 0);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionManager.selector, bob, newOwner, address(0)));
        vm.prank(bob);
        marginCall.reduceExposure(tokenId, sale, 0);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionOwner.selector, alice, newOwner));
        vm.prank(alice);
        marginCall.setExecutor(tokenId, alice);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionOwner.selector, bob, newOwner));
        vm.prank(bob);
        marginCall.setExecutor(tokenId, bob);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionOwner.selector, alice, newOwner));
        vm.prank(alice);
        marginCall.closePosition(tokenId);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionOwner.selector, bob, newOwner));
        vm.prank(bob);
        marginCall.closePosition(tokenId);
    }

    function _assertCarolGainsOwnerControl(uint256 tokenId) internal {
        address dave = makeAddr("dave");
        vm.prank(carol);
        marginCall.setExecutor(tokenId, dave);
        (,,,, address executor) = _position(tokenId);
        assertEq(executor, dave);

        uint256 debt = marginCall.currentDebt(tokenId);
        uint256 slice = debt / 10;
        _fundUsdc(carol, slice);
        vm.prank(carol);
        marginCall.repay(tokenId, slice);

        // Carol's ERC-721 approval is transfer-only: approve can move the NFT but not repay or reduce.
        // Auth reverts before any oracle call, so this stays safe under `_expectNoOracleCalls`.
        address eve = makeAddr("eve");
        vm.prank(carol);
        marginCall.approve(eve, tokenId);
        uint256 remaining = marginCall.currentDebt(tokenId);
        _fundUsdc(eve, remaining);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionManager.selector, eve, carol, dave));
        vm.prank(eve);
        marginCall.repay(tokenId, remaining);

        uint256 sale = ONE_NVDAC / 20;
        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotPositionManager.selector, eve, carol, dave));
        vm.prank(eve);
        marginCall.reduceExposure(tokenId, sale, 0);
    }

    /// @dev equityRatio >= 30% maintenance  <=>  debt / nav <= 70%.
    function _isHealthy(uint256 nav, uint256 debt) internal pure returns (bool) {
        if (nav == 0) {
            return debt == 0;
        }
        if (debt >= nav) {
            return false;
        }
        uint256 equity = nav - debt;
        return equity * V1Config.BPS_DENOMINATOR >= nav * V1Config.MAINTENANCE_EQUITY_RATIO_BPS;
    }

    function _isLiquidatable(uint256 nav, uint256 debt) internal pure returns (bool) {
        return !_isHealthy(nav, debt) && debt > 0;
    }

    /// @dev Choose a feed price so that `debt / NAV ≈ debtShareBps / 10_000`.
    ///      NAV = stock * price / 10^10, so price = debt * 10^10 * 10_000 / (stock * debtShareBps).
    function _priceForDebtShare(uint256 stock, uint256 debt, uint256 debtShareBps) internal pure returns (uint256) {
        return (debt * V1Config.VALUATION_DENOMINATOR * V1Config.BPS_DENOMINATOR) / (stock * debtShareBps);
    }
}
