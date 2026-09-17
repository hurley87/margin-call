// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IOracleAdapter} from "../../src/interfaces/IOracleAdapter.sol";
import {MarginCall} from "../../src/MarginCall.sol";
import {V1Config} from "../../src/V1Config.sol";
import {BaseV1Constants} from "../fixtures/BaseV1Constants.sol";
import {MaintenanceFixtures} from "../fixtures/MaintenanceFixtures.sol";
import {MarginCallTestBase} from "./MarginCallTestBase.sol";

/// @dev RPC-free coverage for the minimal public read surface: existing accounting reads plus LIVE-only
///      `riskSnapshot`, whose liquidation verdict must match the actual `liquidate` predicate.
contract ReadSurfaceTest is MarginCallTestBase {
    uint256 internal constant LIQUIDATABLE_DEBT_SHARE_BPS = MaintenanceFixtures.LIQUIDATABLE_DEBT_SHARE_BPS;
    uint256 internal constant UNDERWATER_DEBT_SHARE_BPS = MaintenanceFixtures.UNDERWATER_DEBT_SHARE_BPS;

    function test_liveHealthyFinancedSnapshotMatchesDebtAndRejectsLiquidate() public {
        (uint256 tokenId, uint256 stock, uint256 debt) = _openFixture();

        uint256 price = BaseV1Constants.PINNED_FEED_ANSWER;
        uint256 expectedNav = oracle.valueUsdc(stock, price);
        assertFalse(_isLiquidatable(expectedNav, debt), "pinned mark must be healthy for a fresh open");

        MarginCall.RiskSnapshot memory snap = marginCall.riskSnapshot(tokenId);

        assertEq(snap.nav, expectedNav);
        assertEq(snap.currentDebt, debt);
        assertEq(snap.currentDebt, marginCall.currentDebt(tokenId));
        assertFalse(snap.liquidatable);

        Snapshot memory before_ = _snapshot(tokenId);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotLiquidatable.selector, tokenId));
        vm.prank(bob);
        marginCall.liquidate(tokenId);
        _assertSnapshot(tokenId, before_);
    }

    function test_equalityAtMaintenanceSnapshotNotLiquidatable() public {
        (uint256 tokenId, uint256 stock, uint256 debt) = _openFixture();

        // Smallest LIVE mark where equity * 10_000 >= NAV * 3_000 (equality is safe).
        uint256 minHealthyNav = Math.ceilDiv(debt * V1Config.BPS_DENOMINATOR, 7_000);
        uint256 price = Math.ceilDiv(minHealthyNav * V1Config.VALUATION_DENOMINATOR, stock);
        _setLivePrice(price);

        uint256 nav = oracle.valueUsdc(stock, price);
        assertTrue(_isHealthy(nav, debt), "equality at 30% equity must be healthy");
        assertFalse(_isLiquidatable(nav, debt));

        MarginCall.RiskSnapshot memory snap = marginCall.riskSnapshot(tokenId);
        assertEq(snap.nav, nav);
        assertEq(snap.currentDebt, debt);
        assertFalse(snap.liquidatable);

        Snapshot memory before_ = _snapshot(tokenId);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotLiquidatable.selector, tokenId));
        vm.prank(bob);
        marginCall.liquidate(tokenId);
        _assertSnapshot(tokenId, before_);

        // One wei below that mark must flip the shared verdict — pins the strict inequality.
        uint256 belowPrice = price - 1;
        _setLivePrice(belowPrice);
        uint256 belowNav = oracle.valueUsdc(stock, belowPrice);
        assertTrue(_isLiquidatable(belowNav, debt), "one tick below threshold must be liquidatable");

        MarginCall.RiskSnapshot memory below = marginCall.riskSnapshot(tokenId);
        assertEq(below.nav, belowNav);
        assertTrue(below.liquidatable);
    }

    function test_belowMaintenanceSnapshotMatchesLiquidateSuccess() public {
        (uint256 tokenId, uint256 stock, uint256 debt) = _openFixture();

        uint256 price = _setLiveDebtSharePrice(stock, debt, LIQUIDATABLE_DEBT_SHARE_BPS);
        uint256 nav = oracle.valueUsdc(stock, price);
        assertTrue(_isLiquidatable(nav, debt));

        MarginCall.RiskSnapshot memory snap = marginCall.riskSnapshot(tokenId);
        assertEq(snap.nav, nav);
        assertEq(snap.currentDebt, debt);
        assertTrue(snap.liquidatable);

        vm.prank(bob);
        marginCall.liquidate(tokenId);
        _assertTokenDoesNotExist(tokenId);
    }

    function test_underwaterSnapshotMatchesLiquidateSuccess() public {
        (uint256 tokenId, uint256 stock, uint256 debt) = _openFixture();

        uint256 price = _setLiveDebtSharePrice(stock, debt, UNDERWATER_DEBT_SHARE_BPS);
        uint256 nav = oracle.valueUsdc(stock, price);
        assertTrue(_isLiquidatable(nav, debt));
        assertLe(nav, debt);

        MarginCall.RiskSnapshot memory snap = marginCall.riskSnapshot(tokenId);
        assertEq(snap.nav, nav);
        assertEq(snap.currentDebt, debt);
        assertTrue(snap.liquidatable);

        vm.prank(bob);
        marginCall.liquidate(tokenId);
        _assertTokenDoesNotExist(tokenId);
    }

    function test_heldAndInvalidRefuseSnapshotWhileAccountingReadsRemain() public {
        (uint256 tokenId, uint256 stock, uint256 debt) = _openFixture();
        uint256 poolCredit = pool.availableCredit();

        oracle.setState(IOracleAdapter.State.HELD);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.OracleNotLive.selector, IOracleAdapter.State.HELD));
        marginCall.riskSnapshot(tokenId);

        assertEq(marginCall.ownerOf(tokenId), alice);
        (uint256 recordedStock, uint256 principal, uint256 accrued, uint256 lastAccrued, address executor) =
            _position(tokenId);
        assertEq(recordedStock, stock);
        assertEq(principal, debt); // fresh open: debt == principal, no elapsed interest
        assertEq(accrued, 0);
        assertEq(lastAccrued, OPENED_AT);
        assertEq(executor, address(0));
        assertEq(marginCall.currentDebt(tokenId), debt);
        assertEq(pool.availableCredit(), poolCredit);

        oracle.setState(IOracleAdapter.State.INVALID);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.OracleNotLive.selector, IOracleAdapter.State.INVALID));
        marginCall.riskSnapshot(tokenId);

        assertEq(marginCall.ownerOf(tokenId), alice);
        assertEq(marginCall.currentDebt(tokenId), debt);
        assertEq(pool.availableCredit(), poolCredit);
    }

    function test_nonexistentAndBurnedTokenRefuseSnapshot() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 1));
        marginCall.riskSnapshot(1);

        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _open(alice, ONE_NVDAC);

        vm.prank(alice);
        marginCall.closePosition(tokenId);

        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, tokenId));
        marginCall.riskSnapshot(tokenId);
        _assertTokenDoesNotExist(tokenId);
        _assertPositionDeleted(tokenId);
    }

    function test_spotPositionSnapshotNeverLiquidatable() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _open(alice, ONE_NVDAC);

        MarginCall.RiskSnapshot memory snap = marginCall.riskSnapshot(tokenId);
        uint256 expectedNav = oracle.valueUsdc(ONE_NVDAC, BaseV1Constants.PINNED_FEED_ANSWER);
        assertEq(snap.nav, expectedNav);
        assertEq(snap.currentDebt, 0);
        assertFalse(snap.liquidatable);

        Snapshot memory before_ = _snapshot(tokenId);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.NotLiquidatable.selector, tokenId));
        vm.prank(bob);
        marginCall.liquidate(tokenId);
        _assertSnapshot(tokenId, before_);
    }

    function test_closeAndLiquidateDistinguishTerminalHistoryByEvents() public {
        // Spot close: token existence ends; terminal outcome is PositionClosed, not PositionLiquidated.
        _fund(alice, ONE_NVDAC);
        uint256 spotId = _open(alice, ONE_NVDAC);

        vm.expectEmit(true, true, true, true, address(marginCall));
        emit IERC721.Transfer(alice, address(0), spotId);
        vm.expectEmit(true, true, false, true, address(marginCall));
        emit MarginCall.PositionClosed(spotId, alice, ONE_NVDAC);

        vm.prank(alice);
        marginCall.closePosition(spotId);
        _assertTokenDoesNotExist(spotId);

        // Financed liquidation shortfall: same burn, different terminal event + BadDebtRealized.
        (uint256 financedId, uint256 stock, uint256 debt) = _openFixture();
        uint256 price = _setLiveDebtSharePrice(stock, debt, UNDERWATER_DEBT_SHARE_BPS);
        uint256 usdcOut = _expectedSellOut(stock, price);
        assertLt(usdcOut, debt);
        uint256 shortfall = debt - usdcOut;

        vm.expectEmit(true, false, false, true, address(marginCall));
        emit MarginCall.DebtRepaid(financedId, usdcOut);
        vm.expectEmit(true, false, false, true, address(marginCall));
        emit MarginCall.BadDebtRealized(financedId, shortfall);
        vm.expectEmit(true, true, true, true, address(marginCall));
        emit IERC721.Transfer(alice, address(0), financedId);
        vm.expectEmit(true, true, false, true, address(marginCall));
        emit MarginCall.PositionLiquidated(financedId, alice, stock, usdcOut);

        vm.prank(bob);
        marginCall.liquidate(financedId);
        _assertTokenDoesNotExist(financedId);
        _assertPositionDeleted(financedId);
    }

    /// @dev One financed 1.25x open by alice, plus the stock and debt every threshold fixture needs.
    function _openFixture() internal returns (uint256 tokenId, uint256 stock, uint256 debt) {
        _fund(alice, ONE_NVDAC);
        tokenId = _openFinanced(alice, ONE_NVDAC, LEVERAGE_1_25X, 0);
        (stock,,,,) = _position(tokenId);
        debt = marginCall.currentDebt(tokenId);
    }
}
