// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IOracleAdapter} from "../../src/interfaces/IOracleAdapter.sol";
import {MarginCall} from "../../src/MarginCall.sol";
import {V1Config} from "../../src/V1Config.sol";
import {BaseV1Constants} from "../fixtures/BaseV1Constants.sol";
import {ExecutionFixtures} from "../fixtures/ExecutionFixtures.sol";
import {MarginCallTestBase} from "./MarginCallTestBase.sol";

/// @dev RPC-free permissionless liquidation: LIVE maintenance predicate, surplus/shortfall settlement, burn.
contract LiquidateTest is MarginCallTestBase {
    /// @dev Positive equity but health factor < 1.0.
    uint256 internal constant LIQUIDATABLE_DEBT_SHARE_BPS = 7_500;
    /// @dev Underwater: debt >= NAV.
    uint256 internal constant UNDERWATER_DEBT_SHARE_BPS = 11_000;

    function test_equalityAtMaintenanceIsNotLiquidatable() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (uint256 stock,,,,) = _position(tokenId);
        uint256 debt = marginCall.currentDebt(tokenId);

        // Smallest LIVE mark where equity * 10_000 >= NAV * 3_000 (equality is safe).
        uint256 minHealthyNav = Math.ceilDiv(debt * V1Config.BPS_DENOMINATOR, 7_000);
        uint256 price = Math.ceilDiv(minHealthyNav * V1Config.VALUATION_DENOMINATOR, stock);
        oracle.setObservation(IOracleAdapter.State.LIVE, price, 2, block.timestamp);
        router.setLivePrice(price);

        uint256 nav = oracle.valueUsdc(stock, price);
        assertTrue(_isHealthy(nav, debt), "equality at 30% equity must be healthy");
        assertFalse(_isLiquidatable(nav, debt));

        // One wei below that mark must be liquidatable — pins the strict inequality.
        uint256 belowPrice = price - 1;
        uint256 belowNav = oracle.valueUsdc(stock, belowPrice);
        assertTrue(_isLiquidatable(belowNav, debt), "one tick below threshold must be liquidatable");

        Snapshot memory before_ = _snapshot(tokenId);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotLiquidatable.selector, tokenId));
        vm.prank(bob);
        marginCall.liquidate(tokenId);
        _assertSnapshot(tokenId, before_);
    }

    function test_belowMaintenanceSurplusGoesToSnapshottedOwner() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (uint256 stock,,,,) = _position(tokenId);
        uint256 debt = marginCall.currentDebt(tokenId);

        uint256 price = _setLiveDebtSharePrice(stock, debt, LIQUIDATABLE_DEBT_SHARE_BPS);
        uint256 nav = oracle.valueUsdc(stock, price);
        assertTrue(_isLiquidatable(nav, debt));
        assertGt(nav, debt);

        uint256 usdcOut = _expectedSellOut(stock, price);
        assertGe(usdcOut, debt, "fixture must be surplus");
        uint256 surplus = usdcOut - debt;

        uint256 poolBefore = pool.availableCredit();
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore = usdc.balanceOf(bob);
        uint256 custodyBefore = nvdac.balanceOf(address(marginCall));

        vm.expectEmit(true, false, false, true, address(marginCall));
        emit MarginCall.DebtRepaid(tokenId, debt);
        vm.expectEmit(true, true, false, true, address(marginCall));
        emit MarginCall.PositionLiquidated(tokenId, alice, stock, usdcOut);

        vm.prank(bob);
        marginCall.liquidate(tokenId);

        _assertTokenDoesNotExist(tokenId);
        _assertPositionDeleted(tokenId);
        assertEq(pool.availableCredit(), poolBefore + debt);
        assertEq(usdc.balanceOf(alice), aliceBefore + surplus, "surplus to NFT owner");
        assertEq(usdc.balanceOf(bob), bobBefore, "liquidator receives nothing");
        assertEq(nvdac.balanceOf(address(marginCall)), custodyBefore - stock);
        assertEq(usdc.balanceOf(address(marginCall)), 0);
    }

    function test_underwaterShortfallEmitsBadDebtAndFinalizes() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (uint256 stock,,,,) = _position(tokenId);
        uint256 debt = marginCall.currentDebt(tokenId);

        uint256 price = _setLiveDebtSharePrice(stock, debt, UNDERWATER_DEBT_SHARE_BPS);
        uint256 nav = oracle.valueUsdc(stock, price);
        assertTrue(debt >= nav);
        assertTrue(_isLiquidatable(nav, debt));

        uint256 usdcOut = _expectedSellOut(stock, price);
        assertLt(usdcOut, debt, "fixture must be shortfall");
        uint256 shortfall = debt - usdcOut;

        uint256 poolBefore = pool.availableCredit();
        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.expectEmit(true, false, false, true, address(marginCall));
        emit MarginCall.DebtRepaid(tokenId, usdcOut);
        vm.expectEmit(true, false, false, true, address(marginCall));
        emit MarginCall.BadDebtRealized(tokenId, shortfall);
        vm.expectEmit(true, true, false, true, address(marginCall));
        emit MarginCall.PositionLiquidated(tokenId, alice, stock, usdcOut);

        vm.prank(bob);
        marginCall.liquidate(tokenId);

        _assertTokenDoesNotExist(tokenId);
        _assertPositionDeleted(tokenId);
        assertEq(pool.availableCredit(), poolBefore + usdcOut, "written-off principal does not restore credit");
        assertEq(usdc.balanceOf(alice), aliceBefore, "owner gets no surplus on shortfall");
        assertEq(usdc.balanceOf(address(marginCall)), 0);
    }

    function test_zeroStockWithDebtIsLiquidatableAtZeroProceeds() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (uint256 stock,,,,) = _position(tokenId);
        uint256 debt = marginCall.currentDebt(tokenId);

        // Crash mark underwater, then sell the entire bag via reduceExposure so residual debt remains with zero stock.
        uint256 price = _setLiveDebtSharePrice(stock, debt, UNDERWATER_DEBT_SHARE_BPS);
        uint256 usdcFromReduce = _expectedSellOut(stock, price);
        assertLt(usdcFromReduce, debt);

        vm.prank(alice);
        marginCall.reduceExposure(tokenId, stock, 0);

        (uint256 stockLeft,,,,) = _position(tokenId);
        uint256 debtLeft = marginCall.currentDebt(tokenId);
        assertEq(stockLeft, 0);
        assertGt(debtLeft, 0);
        assertTrue(_isLiquidatable(0, debtLeft));

        uint256 poolBefore = pool.availableCredit();
        vm.expectEmit(true, false, false, true, address(marginCall));
        emit MarginCall.BadDebtRealized(tokenId, debtLeft);
        vm.expectEmit(true, true, false, true, address(marginCall));
        emit MarginCall.PositionLiquidated(tokenId, alice, 0, 0);

        vm.prank(bob);
        marginCall.liquidate(tokenId);

        _assertTokenDoesNotExist(tokenId);
        assertEq(pool.availableCredit(), poolBefore, "zero proceeds restore nothing");
    }

    function test_dustPriceNavZeroIsLiquidatable() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (uint256 stock,,,,) = _position(tokenId);
        uint256 debt = marginCall.currentDebt(tokenId);
        assertGt(debt, 0);

        // Price 1 floors NAV to 0 for typical stock sizes (stock * 1 / 10^10 == 0 when stock < 10^10).
        uint256 dustPrice = 1;
        oracle.setObservation(IOracleAdapter.State.LIVE, dustPrice, 2, block.timestamp);
        router.setLivePrice(dustPrice);
        uint256 nav = oracle.valueUsdc(stock, dustPrice);
        assertEq(nav, 0);
        assertTrue(_isLiquidatable(nav, debt));

        // Protocol floor at dust price is 0; mock fill at fillBps of dust may also be 0.
        uint256 usdcOut = _expectedSellOut(stock, dustPrice);
        uint256 poolBefore = pool.availableCredit();

        if (usdcOut == 0) {
            vm.expectEmit(true, false, false, true, address(marginCall));
            emit MarginCall.BadDebtRealized(tokenId, debt);
        } else if (usdcOut < debt) {
            vm.expectEmit(true, false, false, true, address(marginCall));
            emit MarginCall.BadDebtRealized(tokenId, debt - usdcOut);
        }

        vm.prank(bob);
        marginCall.liquidate(tokenId);

        _assertTokenDoesNotExist(tokenId);
        assertEq(pool.availableCredit(), poolBefore + usdcOut);
        assertEq(usdc.balanceOf(address(marginCall)), 0);
    }

    function test_spotPositionIsNeverLiquidatable() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _open(alice, ONE_NVDAC);
        assertEq(marginCall.currentDebt(tokenId), 0);

        // Even a crashed LIVE mark cannot make a zero-debt position liquidatable.
        oracle.setObservation(IOracleAdapter.State.LIVE, 1, 2, block.timestamp);
        Snapshot memory before_ = _snapshot(tokenId);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotLiquidatable.selector, tokenId));
        vm.prank(bob);
        marginCall.liquidate(tokenId);
        _assertSnapshot(tokenId, before_);
    }

    function test_surplusAfterTransferGoesToNewOwner() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (uint256 stock,,,,) = _position(tokenId);
        uint256 debt = marginCall.currentDebt(tokenId);

        vm.prank(alice);
        marginCall.transferFrom(alice, carol, tokenId);

        uint256 price = _setLiveDebtSharePrice(stock, debt, LIQUIDATABLE_DEBT_SHARE_BPS);
        uint256 usdcOut = _expectedSellOut(stock, price);
        assertGe(usdcOut, debt);
        uint256 surplus = usdcOut - debt;

        uint256 carolBefore = usdc.balanceOf(carol);
        uint256 aliceBefore = usdc.balanceOf(alice);
        address liquidator = makeAddr("liquidator");

        vm.expectEmit(true, true, false, true, address(marginCall));
        emit MarginCall.PositionLiquidated(tokenId, carol, stock, usdcOut);

        vm.prank(liquidator);
        marginCall.liquidate(tokenId);

        assertEq(usdc.balanceOf(carol), carolBefore + surplus, "surplus to current owner");
        assertEq(usdc.balanceOf(alice), aliceBefore, "prior owner gets nothing");
        _assertTokenDoesNotExist(tokenId);
    }

    function test_heldInvalidAndRevertingOracleBlockLiquidation() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (uint256 stock,,,,) = _position(tokenId);
        uint256 debt = marginCall.currentDebt(tokenId);
        _setLiveDebtSharePrice(stock, debt, LIQUIDATABLE_DEBT_SHARE_BPS);

        Snapshot memory before_ = _snapshot(tokenId);

        oracle.setState(IOracleAdapter.State.HELD);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.OracleNotLive.selector, IOracleAdapter.State.HELD));
        vm.prank(bob);
        marginCall.liquidate(tokenId);
        _assertSnapshot(tokenId, before_);

        oracle.setState(IOracleAdapter.State.INVALID);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.OracleNotLive.selector, IOracleAdapter.State.INVALID));
        vm.prank(bob);
        marginCall.liquidate(tokenId);
        _assertSnapshot(tokenId, before_);

        oracle.setState(IOracleAdapter.State.LIVE);
        oracle.setShouldRevert(true);
        vm.expectRevert();
        vm.prank(bob);
        marginCall.liquidate(tokenId);
        oracle.setShouldRevert(false);
        _assertSnapshot(tokenId, before_);
    }

    function test_permissionlessOwnerAndExecutorCanLiquidate() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenA = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        _fund(alice, ONE_NVDAC);
        uint256 tokenB = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        _fund(alice, ONE_NVDAC);
        uint256 tokenC = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);

        vm.prank(alice);
        marginCall.setExecutor(tokenC, bob);

        _crashLiquidatable(tokenA);
        vm.prank(makeAddr("outsider"));
        marginCall.liquidate(tokenA);
        _assertTokenDoesNotExist(tokenA);

        _crashLiquidatable(tokenB);
        vm.prank(alice);
        marginCall.liquidate(tokenB);
        _assertTokenDoesNotExist(tokenB);

        _crashLiquidatable(tokenC);
        vm.prank(bob);
        marginCall.liquidate(tokenC);
        _assertTokenDoesNotExist(tokenC);
    }

    function test_routerRevertRollsBackAtomically() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (uint256 stock,,,,) = _position(tokenId);
        uint256 debt = marginCall.currentDebt(tokenId);
        _setLiveDebtSharePrice(stock, debt, LIQUIDATABLE_DEBT_SHARE_BPS);

        Snapshot memory before_ = _snapshot(tokenId);
        router.setShouldRevert(true);
        vm.expectRevert();
        vm.prank(bob);
        marginCall.liquidate(tokenId);
        _assertSnapshot(tokenId, before_);
        assertEq(marginCall.ownerOf(tokenId), alice);
    }

    function test_interestAloneCanCrossMaintenance() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_5X, 0);
        (uint256 stock,,,,) = _position(tokenId);

        // Keep the pinned mark; grow debt via accrual until debt / NAV > 70%.
        uint256 price = BaseV1Constants.PINNED_FEED_ANSWER;
        uint256 nav = oracle.valueUsdc(stock, price);
        uint256 targetDebt = Math.mulDiv(nav, 7_500, V1Config.BPS_DENOMINATOR) + 1;

        (, uint256 principal,,,) = _position(tokenId);
        // debt = principal * (1 + 0.1 * tYears)  =>  tYears = (debt/principal - 1) / 0.1
        uint256 needed = Math.mulDiv(targetDebt, V1Config.BPS_DENOMINATOR, principal);
        // needed is in 1e4 scale of (1 + 0.1 t); solve t = (needed/1e4 - 1) / 0.1 * year
        // = (needed - 10000) / 1000 * year
        assertGt(needed, V1Config.BPS_DENOMINATOR);
        uint256 yearsBps = needed - V1Config.BPS_DENOMINATOR; // 0.1 * t * 10000
        uint256 elapsed = Math.mulDiv(yearsBps, V1Config.SECONDS_PER_YEAR, V1Config.BORROW_APR_BPS) + 1;
        vm.warp(OPENED_AT + elapsed);

        uint256 debt = marginCall.currentDebt(tokenId);
        assertTrue(_isLiquidatable(nav, debt), "interest must push past maintenance");

        uint256 usdcOut = _expectedSellOut(stock, price);
        assertGe(usdcOut, debt);

        vm.prank(bob);
        marginCall.liquidate(tokenId);
        _assertTokenDoesNotExist(tokenId);
    }

    function test_liquidationDoesNotTouchSiblingPosition() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenA = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        _fund(bob, ONE_NVDAC);
        uint256 tokenB = _openFinanced(bob, ONE_NVDAC, LEVERAGE_1_25X, 0);

        Snapshot memory siblingBefore = _snapshot(tokenB);

        (uint256 stockA,,,,) = _position(tokenA);
        uint256 debtA = marginCall.currentDebt(tokenA);
        uint256 custodyBefore = nvdac.balanceOf(address(marginCall));
        _setLiveDebtSharePrice(stockA, debtA, LIQUIDATABLE_DEBT_SHARE_BPS);

        vm.prank(carol);
        marginCall.liquidate(tokenA);

        (uint256 stockB, uint256 principalB, uint256 accruedB, uint256 lastB, address execB) = _position(tokenB);
        assertEq(stockB, siblingBefore.stock);
        assertEq(principalB, siblingBefore.principal);
        assertEq(accruedB, siblingBefore.accrued);
        assertEq(lastB, siblingBefore.lastAccrued);
        assertEq(execB, siblingBefore.executor);
        assertEq(marginCall.currentDebt(tokenB), siblingBefore.debt);
        assertEq(marginCall.ownerOf(tokenB), bob);
        assertEq(nvdac.balanceOf(address(marginCall)), custodyBefore - stockA);
        _assertTokenDoesNotExist(tokenA);
    }

    function test_nonexistentTokenReverts() public {
        vm.expectRevert();
        vm.prank(bob);
        marginCall.liquidate(1);
    }

    struct Snapshot {
        uint256 stock;
        uint256 principal;
        uint256 accrued;
        uint256 lastAccrued;
        address executor;
        uint256 debt;
        uint256 poolCredit;
        uint256 custody;
        uint256 aliceUsdc;
    }

    function _snapshot(uint256 tokenId) internal view returns (Snapshot memory s) {
        (s.stock, s.principal, s.accrued, s.lastAccrued, s.executor) = _position(tokenId);
        s.debt = marginCall.currentDebt(tokenId);
        s.poolCredit = pool.availableCredit();
        s.custody = nvdac.balanceOf(address(marginCall));
        s.aliceUsdc = usdc.balanceOf(alice);
    }

    function _assertSnapshot(uint256 tokenId, Snapshot memory expected) internal view {
        (uint256 stock, uint256 principal, uint256 accrued, uint256 lastAccrued, address executor) = _position(tokenId);
        assertEq(stock, expected.stock);
        assertEq(principal, expected.principal);
        assertEq(accrued, expected.accrued);
        assertEq(lastAccrued, expected.lastAccrued);
        assertEq(executor, expected.executor);
        assertEq(marginCall.currentDebt(tokenId), expected.debt);
        assertEq(pool.availableCredit(), expected.poolCredit);
        assertEq(nvdac.balanceOf(address(marginCall)), expected.custody);
        assertEq(usdc.balanceOf(alice), expected.aliceUsdc);
        assertEq(usdc.balanceOf(address(marginCall)), 0);
    }

    function _expectedSellOut(uint256 nvdaAmountIn, uint256 livePrice) internal pure returns (uint256) {
        return ExecutionFixtures.protocolMinUsdcOutForSell(nvdaAmountIn, livePrice);
    }

    function _crashLiquidatable(uint256 tokenId) internal {
        (uint256 stock,,,,) = _position(tokenId);
        uint256 debt = marginCall.currentDebt(tokenId);
        _setLiveDebtSharePrice(stock, debt, LIQUIDATABLE_DEBT_SHARE_BPS);
    }
}
