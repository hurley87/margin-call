// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {IExecutionAdapter} from "../src/interfaces/IExecutionAdapter.sol";
import {IOracleAdapter} from "../src/interfaces/IOracleAdapter.sol";
import {MarginCall} from "../src/MarginCall.sol";
import {V1Config} from "../src/V1Config.sol";
import {BaseV1Constants} from "../test/fixtures/BaseV1Constants.sol";
import {MarginCallForkBase} from "./MarginCallForkBase.sol";

/// @dev Pinned Base-mainnet proof that `liquidate` sells the full NVDAc bag on the approved Uniswap V3 route.
contract LiquidateForkTest is MarginCallForkBase {
    function _forkActorLabel() internal pure override returns (string memory) {
        return "liquidate-fork-alice-426";
    }

    function test_liquidateSellsFullBagOnUniswapUnderMockedUnhealthyMark() public {
        IOracleAdapter.Observation memory live = oracle.latestObservation();
        assertEq(uint256(live.state), uint256(IOracleAdapter.State.LIVE));

        vm.prank(alice);
        uint256 tokenId = marginCall.openPosition(ONE_NVDAC, V1Config.LEVERAGE_1_25X, 0);

        (uint256 stock, uint256 principal,,,) = marginCall.positions(tokenId);
        assertGt(stock, ONE_NVDAC);
        assertGt(principal, 0);
        uint256 debt = marginCall.currentDebt(tokenId);

        // Mock a LIVE-but-liquidatable mark for eligibility. Real Uniswap still fills near the pinned market,
        // so proceeds cover debt and surplus routes to the owner (shortfall stays in the RPC-free suite).
        uint256 liquidatablePrice = (debt * V1Config.VALUATION_DENOMINATOR * V1Config.BPS_DENOMINATOR) / (stock * 7_500);
        assertTrue(debt > 0 && !_isHealthy(oracle.valueUsdc(stock, liquidatablePrice), debt), "fixture must be liquidatable");

        _mockLiveObservation(liquidatablePrice, live.roundId, block.timestamp);

        uint256 poolBefore = pool.availableCredit();
        uint256 custodyBefore = nvdac.balanceOf(address(marginCall));
        uint256 aliceUsdcBefore = usdc.balanceOf(alice);
        address liquidator = makeAddr("fork-liquidator");
        uint256 liquidatorUsdcBefore = usdc.balanceOf(liquidator);

        vm.prank(liquidator);
        marginCall.liquidate(tokenId);

        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, tokenId));
        marginCall.ownerOf(tokenId);

        _assertPositionCleared(tokenId);
        assertEq(nvdac.balanceOf(address(marginCall)), custodyBefore - stock, "full bag sold");
        assertEq(usdc.balanceOf(address(marginCall)), 0, "no residual USDC");
        assertEq(pool.availableCredit(), poolBefore + debt, "exact debt restored to pool");
        assertGt(usdc.balanceOf(alice), aliceUsdcBefore, "surplus to NFT owner");
        assertEq(usdc.balanceOf(liquidator), liquidatorUsdcBefore, "liquidator receives nothing");
    }

    function test_liquidateRequiresLiveOracleOnFork() public {
        vm.prank(alice);
        uint256 tokenId = marginCall.openPosition(ONE_NVDAC, V1Config.LEVERAGE_1_25X, 0);
        (uint256 stockBefore, uint256 principalBefore,, uint256 lastAccruedBefore,) = marginCall.positions(tokenId);
        uint256 poolBefore = pool.availableCredit();
        uint256 custodyBefore = nvdac.balanceOf(address(marginCall));

        vm.warp(block.timestamp + BaseV1Constants.MAX_LIVE_AGE + 1);
        // View debt grows with the warp; live accounting is unchanged until a write path accrues.
        uint256 debtAfterWarp = marginCall.currentDebt(tokenId);

        vm.expectRevert(abi.encodeWithSelector(MarginCall.OracleNotLive.selector, IOracleAdapter.State.INVALID));
        vm.prank(makeAddr("fork-liquidator"));
        marginCall.liquidate(tokenId);

        (uint256 stockAfter, uint256 principalAfter,, uint256 lastAccruedAfter,) = marginCall.positions(tokenId);
        assertEq(stockAfter, stockBefore);
        assertEq(principalAfter, principalBefore);
        assertEq(lastAccruedAfter, lastAccruedBefore, "failed liquidate must not accrue");
        assertEq(marginCall.currentDebt(tokenId), debtAfterWarp);
        assertEq(pool.availableCredit(), poolBefore);
        assertEq(nvdac.balanceOf(address(marginCall)), custodyBefore);
        assertEq(marginCall.ownerOf(tokenId), alice);
    }

    function test_liquidateSellRevertRollsBackAtomicallyOnFork() public {
        vm.prank(alice);
        uint256 tokenId = marginCall.openPosition(ONE_NVDAC, V1Config.LEVERAGE_1_25X, 0);
        (uint256 stock, uint256 principalBefore,,,) = marginCall.positions(tokenId);
        uint256 debt = marginCall.currentDebt(tokenId);

        IOracleAdapter.Observation memory live = oracle.latestObservation();
        uint256 liquidatablePrice = (debt * V1Config.VALUATION_DENOMINATOR * V1Config.BPS_DENOMINATOR) / (stock * 7_500);
        _mockLiveObservation(liquidatablePrice, live.roundId, block.timestamp);

        // Force the execution path to revert after eligibility passes; position must remain active.
        vm.mockCallRevert(
            address(execution),
            abi.encodeWithSelector(IExecutionAdapter.sellNvda.selector, stock, uint256(0), liquidatablePrice),
            "mock sell revert"
        );

        uint256 poolBefore = pool.availableCredit();
        uint256 custodyBefore = nvdac.balanceOf(address(marginCall));
        uint256 aliceUsdcBefore = usdc.balanceOf(alice);

        vm.expectRevert(bytes("mock sell revert"));
        vm.prank(makeAddr("fork-liquidator"));
        marginCall.liquidate(tokenId);

        (uint256 stockAfter, uint256 principalAfter,,,) = marginCall.positions(tokenId);
        assertEq(stockAfter, stock);
        assertEq(principalAfter, principalBefore);
        assertEq(marginCall.currentDebt(tokenId), debt);
        assertEq(pool.availableCredit(), poolBefore);
        assertEq(nvdac.balanceOf(address(marginCall)), custodyBefore);
        assertEq(usdc.balanceOf(alice), aliceUsdcBefore);
        assertEq(marginCall.ownerOf(tokenId), alice);
    }

    function _mockLiveObservation(uint256 price, uint80 roundId, uint256 updatedAt) internal {
        IOracleAdapter.Observation memory obs = IOracleAdapter.Observation({
            state: IOracleAdapter.State.LIVE,
            price: price,
            roundId: roundId,
            updatedAt: updatedAt
        });
        vm.mockCall(address(oracle), abi.encodeWithSelector(IOracleAdapter.latestObservation.selector), abi.encode(obs));
    }

    function _assertPositionCleared(uint256 tokenId) internal view {
        (uint256 stockAmount, uint256 principal, uint256 accruedInterest, uint256 lastAccruedAt, address executor) =
            marginCall.positions(tokenId);
        assertEq(stockAmount, 0);
        assertEq(principal, 0);
        assertEq(accruedInterest, 0);
        assertEq(lastAccruedAt, 0);
        assertEq(executor, address(0));
    }

    /// @dev Mirror of the RPC-free health helper: equityRatio >= 30% <=> debt / nav <= 70%.
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
}
