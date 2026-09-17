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

/// @dev Pinned Base-mainnet proof that `reduceExposure` sells NVDAc on the approved Uniswap V3 route.
contract ReduceExposureForkTest is Test {
    uint256 internal constant BASE_BLOCK = BaseV1Constants.PINNED_BLOCK;
    uint256 internal constant ONE_NVDAC = 1e8;
    uint256 internal constant CREDIT_SEED = 500_000e6;
    /// @dev ~$10 of NVDAc at the pinned feed (~4.72e6 raw units); matches fork sell fixtures.
    uint256 internal constant SMALL_SALE = 4_721_769;

    IERC20 internal nvdac = IERC20(BaseV1Constants.NVDAC);
    IERC20 internal usdc = IERC20(BaseV1Constants.USDC);

    OracleAdapter internal oracle;
    ExecutionAdapter internal execution;
    MarginCall internal marginCall;
    CreditPool internal pool;

    address internal alice;

    function setUp() public {
        vm.createSelectFork(vm.envString("BASE_MAINNET_RPC_URL"), BASE_BLOCK);
        alice = makeAddr("reduce-fork-alice-425");
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

    function test_reduceExposureSellsExactStockOnUniswap() public {
        IOracleAdapter.Observation memory obs = oracle.latestObservation();
        assertEq(uint256(obs.state), uint256(IOracleAdapter.State.LIVE));

        vm.prank(alice);
        uint256 tokenId = marginCall.openPosition(ONE_NVDAC, V1Config.LEVERAGE_1_25X, 0);

        (uint256 stockBefore, uint256 principalBefore,,,) = marginCall.positions(tokenId);
        assertGt(stockBefore, ONE_NVDAC);
        assertGt(principalBefore, 0);
        assertTrue(SMALL_SALE < stockBefore);

        uint256 protocolMin = execution.protocolMinUsdcOutForSell(SMALL_SALE, obs.price);
        uint256 poolBefore = pool.availableCredit();
        uint256 custodyBefore = nvdac.balanceOf(address(marginCall));
        uint256 aliceUsdcBefore = usdc.balanceOf(alice);
        uint256 debtBefore = marginCall.currentDebt(tokenId);

        vm.prank(alice);
        marginCall.reduceExposure(tokenId, SMALL_SALE, 0);

        (uint256 stockAfter,,,,) = marginCall.positions(tokenId);
        assertEq(stockAfter, stockBefore - SMALL_SALE, "exact stock sold");
        assertEq(nvdac.balanceOf(address(marginCall)), custodyBefore - SMALL_SALE);
        assertEq(usdc.balanceOf(address(marginCall)), 0, "no residual USDC");

        uint256 repaid = debtBefore - marginCall.currentDebt(tokenId);
        assertGt(repaid, 0, "sale must repay some debt");
        assertEq(pool.availableCredit(), poolBefore + repaid);

        uint256 surplus = usdc.balanceOf(alice) - aliceUsdcBefore;
        assertGe(repaid + surplus, protocolMin);
        assertEq(marginCall.ownerOf(tokenId), alice);
    }

    function test_reduceExposureTightMinOutRevertsAtomicallyOnFork() public {
        vm.prank(alice);
        uint256 tokenId = marginCall.openPosition(ONE_NVDAC, V1Config.LEVERAGE_1_25X, 0);

        (uint256 stockBefore, uint256 principalBefore,,,) = marginCall.positions(tokenId);
        uint256 poolBefore = pool.availableCredit();
        uint256 custodyBefore = nvdac.balanceOf(address(marginCall));
        uint256 aliceUsdcBefore = usdc.balanceOf(alice);
        uint256 debtBefore = marginCall.currentDebt(tokenId);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "Too little received"));
        marginCall.reduceExposure(tokenId, SMALL_SALE, type(uint256).max / 2);

        (uint256 stockAfter, uint256 principalAfter,,,) = marginCall.positions(tokenId);
        assertEq(stockAfter, stockBefore);
        assertEq(principalAfter, principalBefore);
        assertEq(marginCall.currentDebt(tokenId), debtBefore);
        assertEq(pool.availableCredit(), poolBefore);
        assertEq(nvdac.balanceOf(address(marginCall)), custodyBefore);
        assertEq(usdc.balanceOf(alice), aliceUsdcBefore);
        assertEq(usdc.balanceOf(address(marginCall)), 0);
    }

    function test_reduceExposureRequiresLiveOracleOnFork() public {
        vm.prank(alice);
        uint256 tokenId = marginCall.openPosition(ONE_NVDAC, V1Config.LEVERAGE_1_25X, 0);
        (uint256 stockBefore,,,,) = marginCall.positions(tokenId);

        vm.warp(block.timestamp + BaseV1Constants.MAX_LIVE_AGE + 1);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.OracleNotLive.selector, IOracleAdapter.State.INVALID));
        marginCall.reduceExposure(tokenId, SMALL_SALE, 0);

        (uint256 stockAfter,,,,) = marginCall.positions(tokenId);
        assertEq(stockAfter, stockBefore);
    }

    function _fundNvda(address to, uint256 amount) private {
        vm.prank(BaseV1Constants.PINNED_NVDAC_HOLDER);
        assertTrue(nvdac.transfer(to, amount));
    }
}
