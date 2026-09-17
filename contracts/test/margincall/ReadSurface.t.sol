// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {IOracleAdapter} from "../../src/interfaces/IOracleAdapter.sol";
import {MarginCall} from "../../src/MarginCall.sol";
import {BaseV1Constants} from "../fixtures/BaseV1Constants.sol";
import {MaintenanceFixtures} from "../fixtures/MaintenanceFixtures.sol";
import {MarginCallTestBase} from "./MarginCallTestBase.sol";

/// @dev RPC-free coverage for the minimal public read surface: existing accounting reads plus LIVE-only
///      `riskSnapshot`, whose liquidation verdict must match the actual `liquidate` predicate.
contract ReadSurfaceTest is MarginCallTestBase {
    function test_liveHealthyFinancedSnapshotMatchesDebtAndRejectsLiquidate() public {
        (uint256 tokenId, uint256 stock, uint256 debt) = _openFinancedFixture();

        uint256 nav = oracle.valueUsdc(stock, BaseV1Constants.PINNED_FEED_ANSWER);
        assertFalse(_isLiquidatable(nav, debt), "pinned mark must be healthy for a fresh open");

        _assertSnapshotMatchesLiquidate(tokenId, nav, debt, false);
    }

    function test_equalityAtMaintenanceSnapshotNotLiquidatable() public {
        (uint256 tokenId, uint256 stock, uint256 debt) = _openFinancedFixture();

        // Smallest LIVE mark that is still healthy: equality at the 30% maintenance ratio is safe.
        uint256 price = MaintenanceFixtures.minHealthyPrice(stock, debt);
        _setLivePrice(price);

        uint256 nav = oracle.valueUsdc(stock, price);
        assertTrue(_isHealthy(nav, debt), "equality at 30% equity must be healthy");

        _assertSnapshotMatchesLiquidate(tokenId, nav, debt, false);

        // One tick below that mark must flip the shared verdict — pins the strict inequality, and the flipped
        // verdict is proven against the real `liquidate` rather than only against the view.
        uint256 belowPrice = price - 1;
        _setLivePrice(belowPrice);
        uint256 belowNav = oracle.valueUsdc(stock, belowPrice);
        assertTrue(_isLiquidatable(belowNav, debt), "one tick below threshold must be liquidatable");

        _assertSnapshotMatchesLiquidate(tokenId, belowNav, debt, true);
    }

    function test_belowMaintenanceSnapshotMatchesLiquidateSuccess() public {
        (uint256 tokenId, uint256 stock, uint256 debt) = _openFinancedFixture();

        uint256 price = _setLiveDebtSharePrice(stock, debt, LIQUIDATABLE_DEBT_SHARE_BPS);
        uint256 nav = oracle.valueUsdc(stock, price);
        assertGt(nav, debt, "fixture must be liquidatable but not yet underwater");

        _assertSnapshotMatchesLiquidate(tokenId, nav, debt, true);
    }

    function test_underwaterSnapshotMatchesLiquidateSuccess() public {
        (uint256 tokenId, uint256 stock, uint256 debt) = _openFinancedFixture();

        uint256 price = _setLiveDebtSharePrice(stock, debt, UNDERWATER_DEBT_SHARE_BPS);
        uint256 nav = oracle.valueUsdc(stock, price);
        assertLe(nav, debt, "fixture must be underwater");

        _assertSnapshotMatchesLiquidate(tokenId, nav, debt, true);
    }

    function test_spotPositionSnapshotNeverLiquidatable() public {
        _fund(alice, ONE_NVDAC);
        uint256 tokenId = _open(alice, ONE_NVDAC);

        uint256 nav = oracle.valueUsdc(ONE_NVDAC, BaseV1Constants.PINNED_FEED_ANSWER);
        _assertSnapshotMatchesLiquidate(tokenId, nav, 0, false);
    }

    function test_heldAndInvalidRefuseSnapshotWhileAccountingReadsRemain() public {
        (uint256 tokenId,,) = _openFinancedFixture();
        Snapshot memory before_ = _snapshot(tokenId);

        oracle.setState(IOracleAdapter.State.HELD);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.OracleNotLive.selector, IOracleAdapter.State.HELD));
        marginCall.riskSnapshot(tokenId);
        assertEq(marginCall.ownerOf(tokenId), alice, "ownership stays readable without a live mark");
        _assertSnapshot(tokenId, before_);

        oracle.setState(IOracleAdapter.State.INVALID);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.OracleNotLive.selector, IOracleAdapter.State.INVALID));
        marginCall.riskSnapshot(tokenId);
        assertEq(marginCall.ownerOf(tokenId), alice);
        _assertSnapshot(tokenId, before_);
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

    /// @dev The property this suite exists to prove: the public snapshot at the current mark agrees with what
    ///      `liquidate` actually does. Liquidatable => the NFT is gone; healthy => `NotLiquidatable` and nothing
    ///      moved. Writing it once keeps a sixth threshold case from drifting into its own variant.
    function _assertSnapshotMatchesLiquidate(
        uint256 tokenId,
        uint256 expectedNav,
        uint256 expectedDebt,
        bool liquidatable
    ) internal {
        MarginCall.RiskSnapshot memory snap = marginCall.riskSnapshot(tokenId);
        assertEq(snap.nav, expectedNav, "nav");
        assertEq(snap.currentDebt, expectedDebt, "currentDebt");
        assertEq(snap.currentDebt, marginCall.currentDebt(tokenId), "snapshot debt must match the standalone read");
        assertEq(snap.liquidatable, liquidatable, "verdict");

        if (liquidatable) {
            vm.prank(bob);
            marginCall.liquidate(tokenId);
            _assertTokenDoesNotExist(tokenId);
            _assertPositionDeleted(tokenId);
        } else {
            Snapshot memory before_ = _snapshot(tokenId);
            vm.expectRevert(abi.encodeWithSelector(MarginCall.NotLiquidatable.selector, tokenId));
            vm.prank(bob);
            marginCall.liquidate(tokenId);
            _assertSnapshot(tokenId, before_);
        }
    }
}
