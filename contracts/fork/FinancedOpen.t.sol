// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CreditPool} from "../src/CreditPool.sol";
import {ExecutionAdapter} from "../src/ExecutionAdapter.sol";
import {IOracleAdapter} from "../src/interfaces/IOracleAdapter.sol";
import {MarginCall} from "../src/MarginCall.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {V1Config} from "../src/V1Config.sol";
import {BaseV1Constants} from "../test/fixtures/BaseV1Constants.sol";

/// @dev Pinned Base-mainnet proof that production adapters open every financed preset via Uniswap V3.
contract FinancedOpenForkTest is Test {
    uint256 internal constant BASE_BLOCK = BaseV1Constants.PINNED_BLOCK;
    uint256 internal constant ONE_NVDAC = 1e8;
    uint256 internal constant CREDIT_SEED = 500_000e6;

    IERC20 internal nvdac = IERC20(BaseV1Constants.NVDAC);
    IERC20 internal usdc = IERC20(BaseV1Constants.USDC);

    OracleAdapter internal oracle;
    ExecutionAdapter internal execution;
    MarginCall internal marginCall;
    CreditPool internal pool;

    address internal alice;

    function setUp() public {
        vm.createSelectFork(vm.envString("BASE_MAINNET_RPC_URL"), BASE_BLOCK);
        alice = makeAddr("financed-fork-alice-422");
        // Ensure the opener is a pure EOA on the forked chain (safeMint rejects contract recipients
        // that lack IERC721Receiver).
        vm.etch(alice, "");

        oracle = new OracleAdapter(
            BaseV1Constants.NVDAC,
            BaseV1Constants.NVDA_FEED,
            BaseV1Constants.COINBASE_ORACLE_REGISTRY,
            BaseV1Constants.BASE_SEQUENCER_UPTIME_FEED
        );
        execution = new ExecutionAdapter(
            BaseV1Constants.USDC,
            BaseV1Constants.NVDAC,
            BaseV1Constants.UNISWAP_SWAP_ROUTER_02,
            BaseV1Constants.UNISWAP_FEE
        );
        marginCall = new MarginCall(BaseV1Constants.NVDAC, BaseV1Constants.USDC, address(oracle), address(execution));
        pool = new CreditPool(BaseV1Constants.USDC, address(marginCall));
        marginCall.setCreditPool(address(pool));

        deal(BaseV1Constants.USDC, address(pool), CREDIT_SEED);
        _fundNvda(alice, 10 * ONE_NVDAC);
        vm.prank(alice);
        nvdac.approve(address(marginCall), type(uint256).max);
    }

    function test_oracleIsLiveAtPinnedBlock() public {
        IOracleAdapter.Observation memory obs = oracle.latestObservation();
        assertEq(uint256(obs.state), uint256(IOracleAdapter.State.LIVE));
        assertEq(obs.price, BaseV1Constants.PINNED_FEED_ANSWER);
    }

    function test_financedOpenAllPresetsOnUniswap() public {
        uint256[4] memory presets = [
            V1Config.LEVERAGE_1_1X,
            V1Config.LEVERAGE_1_25X,
            V1Config.LEVERAGE_1_4X,
            V1Config.LEVERAGE_1_5X
        ];

        for (uint256 i = 0; i < presets.length; ++i) {
            uint256 poolBefore = pool.availableCredit();
            uint256 custodyBefore = nvdac.balanceOf(address(marginCall));

            vm.prank(alice);
            uint256 tokenId = marginCall.openPosition(ONE_NVDAC, presets[i], 0);

            (uint256 stock, uint256 principal,,,) = marginCall.positions(tokenId);
            assertEq(marginCall.ownerOf(tokenId), alice);
            assertGt(stock, ONE_NVDAC);
            assertGt(principal, 0);
            assertEq(marginCall.currentDebt(tokenId), principal);
            assertEq(pool.availableCredit(), poolBefore - principal);
            assertEq(nvdac.balanceOf(address(marginCall)), custodyBefore + stock);
            assertEq(usdc.balanceOf(address(marginCall)), 0);

            IOracleAdapter.Observation memory obs = oracle.latestObservation();
            uint256 nav = oracle.valueUsdc(stock, obs.price);
            assertLe(nav * V1Config.BPS_DENOMINATOR, (nav - principal) * presets[i]);
            assertLe(nav * V1Config.BPS_DENOMINATOR, (nav - principal) * V1Config.LEVERAGE_1_5X);
        }
    }

    function test_intermediateLeverageRevertsOnFork() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.UnsupportedLeverage.selector, 13_000));
        marginCall.openPosition(ONE_NVDAC, 13_000, 0);
    }

    function test_insufficientCreditRevertsOnFork() public {
        uint256 available = pool.availableCredit();
        vm.prank(address(marginCall));
        pool.draw(available - 1e6);

        uint256 aliceBefore = nvdac.balanceOf(alice);
        uint256 poolBefore = pool.availableCredit();

        vm.prank(alice);
        vm.expectRevert();
        marginCall.openPosition(ONE_NVDAC, V1Config.LEVERAGE_1_5X, 0);

        assertEq(nvdac.balanceOf(alice), aliceBefore);
        assertEq(pool.availableCredit(), poolBefore);
        assertEq(nvdac.balanceOf(address(marginCall)), 0);
    }

    function test_spotStillOpensWithEmptyPoolOnFork() public {
        uint256 available = pool.availableCredit();
        vm.prank(address(marginCall));
        pool.draw(available);

        vm.prank(alice);
        uint256 tokenId = marginCall.openPosition(ONE_NVDAC, V1Config.SPOT_LEVERAGE, 0);
        (uint256 stock, uint256 principal,,,) = marginCall.positions(tokenId);
        assertEq(stock, ONE_NVDAC);
        assertEq(principal, 0);
    }

    function test_nonLiveOracleRevertsFinancedOpenOnFork() public {
        // Freeze the feed as stale beyond MAX_LIVE_AGE while leaving the registry unpaused.
        vm.warp(block.timestamp + BaseV1Constants.MAX_LIVE_AGE + 1);

        uint256 aliceBefore = nvdac.balanceOf(alice);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.OracleNotLive.selector, IOracleAdapter.State.INVALID));
        marginCall.openPosition(ONE_NVDAC, V1Config.LEVERAGE_1_1X, 0);
        assertEq(nvdac.balanceOf(alice), aliceBefore);
    }

    function test_tightCallerMinOutRevertsAtomicallyOnFork() public {
        uint256 aliceBefore = nvdac.balanceOf(alice);
        uint256 poolBefore = pool.availableCredit();

        // Unrealistically high minOut forces SwapRouter02 "Too little received".
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "Too little received"));
        marginCall.openPosition(ONE_NVDAC, V1Config.LEVERAGE_1_25X, type(uint256).max / 2);

        assertEq(nvdac.balanceOf(alice), aliceBefore);
        assertEq(pool.availableCredit(), poolBefore);
        assertEq(usdc.balanceOf(address(marginCall)), 0);
        assertEq(nvdac.balanceOf(address(marginCall)), 0);
    }

    function test_executionAdapterBuyRespectsProtocolFloorOnFork() public {
        IOracleAdapter.Observation memory obs = oracle.latestObservation();
        uint256 amountIn = 100e6;
        deal(BaseV1Constants.USDC, address(this), amountIn);
        usdc.approve(address(execution), amountIn);

        uint256 minOut = execution.protocolMinNvdaOutForBuy(amountIn, obs.price);
        uint256 before = nvdac.balanceOf(address(this));
        uint256 amountOut = execution.buyNvda(amountIn, minOut, obs.price);
        assertGe(amountOut, minOut);
        assertEq(nvdac.balanceOf(address(this)) - before, amountOut);
    }

    function _fundNvda(address to, uint256 amount) private {
        vm.prank(BaseV1Constants.PINNED_NVDAC_HOLDER);
        assertTrue(nvdac.transfer(to, amount));
    }
}
