// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";

import {CreditPool} from "../../src/CreditPool.sol";
import {ExecutionAdapter} from "../../src/ExecutionAdapter.sol";
import {IOracleAdapter} from "../../src/interfaces/IOracleAdapter.sol";
import {MarginCall} from "../../src/MarginCall.sol";
import {OracleAdapter} from "../../src/OracleAdapter.sol";
import {V1Config} from "../../src/V1Config.sol";
import {BaseV1Constants} from "../fixtures/BaseV1Constants.sol";
import {OracleFixtures} from "../fixtures/OracleFixtures.sol";
import {MockNvdaC, MockSwapRouter, MockUsdc} from "./PositionNftTestDoubles.sol";

contract StubAggregator {
    uint80 public roundId;
    int256 public answer;
    uint256 public startedAt;
    uint256 public updatedAt;
    uint80 public answeredInRound;

    function set(uint80 r, int256 a, uint256 s, uint256 u, uint80 air) external {
        roundId = r;
        answer = a;
        startedAt = s;
        updatedAt = u;
        answeredInRound = air;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, answer, startedAt, updatedAt, answeredInRound);
    }
}

contract StubRegistry {
    bool public paused;

    function setPaused(bool p) external {
        paused = p;
    }

    function getOracleParams(address) external view returns (uint256, bool) {
        return (1e18, paused);
    }
}

/// @dev Financed opening driven through the *production* OracleAdapter rather than a controllable double, so the
///      registry-pause path is exercised end to end.
contract FinancedOpenOraclePolicyTest is Test {
    MockNvdaC internal nvdac;
    MockUsdc internal usdc;
    MockSwapRouter internal router;
    StubAggregator internal feed;
    StubRegistry internal registry;
    StubAggregator internal sequencer;
    OracleAdapter internal oracle;
    MarginCall internal marginCall;
    CreditPool internal pool;
    ExecutionAdapter internal execution;

    address internal alice = makeAddr("alice");
    address internal assetAdmin = makeAddr("assetAdmin");
    uint256 internal assetId;
    uint256 internal constant ONE_NVDAC = 1e8;

    function setUp() public {
        feed = new StubAggregator();
        registry = new StubRegistry();
        sequencer = new StubAggregator();
        _setRound(OracleFixtures.NVDA_ROUND_ID, OracleFixtures.NVDA_STARTED_AT, OracleFixtures.NVDA_UPDATED_AT);
        sequencer.set(
            OracleFixtures.SEQUENCER_ROUND_ID,
            0,
            OracleFixtures.SEQUENCER_STARTED_AT,
            OracleFixtures.SEQUENCER_UPDATED_AT,
            OracleFixtures.SEQUENCER_ROUND_ID
        );
        vm.warp(BaseV1Constants.PINNED_TIMESTAMP);

        nvdac = new MockNvdaC();
        usdc = new MockUsdc();
        oracle = new OracleAdapter(address(nvdac), address(feed), address(registry), address(sequencer));
        router = new MockSwapRouter(usdc, address(nvdac));
        execution = new ExecutionAdapter(address(usdc), address(nvdac), address(router), BaseV1Constants.UNISWAP_FEE);
        marginCall = new MarginCall(address(usdc), assetAdmin);
        pool = new CreditPool(address(usdc), address(marginCall), makeAddr("treasury"));
        marginCall.setCreditPool(address(pool));

        vm.prank(assetAdmin);
        assetId = marginCall.addAsset(address(nvdac), address(oracle), address(execution));

        usdc.mint(address(pool), 1_000_000e6);
        router.setLivePrice(BaseV1Constants.PINNED_FEED_ANSWER);
        nvdac.mint(alice, 10 * ONE_NVDAC);
        vm.prank(alice);
        nvdac.approve(address(marginCall), type(uint256).max);
    }

    function test_financedOpenSucceedsOnALiveRound() public {
        vm.prank(alice);
        uint256 tokenId = marginCall.openPosition(assetId, ONE_NVDAC, V1Config.LEVERAGE_1_25X, 0);
        assertEq(marginCall.ownerOf(tokenId), alice);
    }

    /// @dev The sequence from the review: pause -> financed open reverts -> unpause with the SAME round ->
    ///      the open must still be blocked. This only holds because the hold was committed by `refresh`.
    function test_observedHoldBlocksTheFrozenRoundAfterUnpause() public {
        registry.setPaused(true);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.OracleNotLive.selector, IOracleAdapter.State.HELD));
        marginCall.openPosition(assetId, ONE_NVDAC, V1Config.LEVERAGE_1_25X, 0);

        // An operator commits the hold while the registry is paused.
        oracle.refresh();
        assertTrue(oracle.hasObservedHold());

        registry.setPaused(false);

        // Same frozen round: still refused, now as INVALID rather than accepted as LIVE.
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.OracleNotLive.selector, IOracleAdapter.State.INVALID));
        marginCall.openPosition(assetId, ONE_NVDAC, V1Config.LEVERAGE_1_25X, 0);

        // A genuinely fresh post-hold round clears the gate.
        _setRound(
            OracleFixtures.NVDA_ROUND_ID + 1, OracleFixtures.NVDA_STARTED_AT + 60, OracleFixtures.NVDA_UPDATED_AT + 60
        );
        vm.prank(alice);
        uint256 tokenId = marginCall.openPosition(assetId, ONE_NVDAC, V1Config.LEVERAGE_1_25X, 0);
        assertEq(marginCall.ownerOf(tokenId), alice);
    }

    /// @dev A rejected open must not be able to record the hold itself: it reverts, and the revert would roll the
    ///      write back. This pins why recording is a separate committing call.
    function test_rejectedOpenCannotRecordTheHold() public {
        registry.setPaused(true);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.OracleNotLive.selector, IOracleAdapter.State.HELD));
        marginCall.openPosition(assetId, ONE_NVDAC, V1Config.LEVERAGE_1_25X, 0);

        assertFalse(oracle.hasObservedHold(), "a reverted open records nothing");
        assertEq(oracle.lastRefreshedAt(), 0);
    }

    /// @dev KNOWN LIMITATION. The registry exposes only a current `paused` bool, with no pause history, so a halt
    ///      that begins and ends with no committed observation in between is invisible to the adapter and the
    ///      frozen round is served as LIVE. Closing this needs either an operator refresh across every halt (the
    ///      test above) or a stateless recency bound tighter than MAX_LIVE_AGE for the financed path. Pinned here
    ///      so the residual exposure is visible in CI rather than rediscovered.
    function test_unobservedHoldLeavesTheFrozenRoundUsable() public {
        registry.setPaused(true);
        registry.setPaused(false);

        IOracleAdapter.Observation memory obs = oracle.latestObservation();
        assertEq(uint256(obs.state), uint256(IOracleAdapter.State.LIVE), "unobserved halt is undetectable");

        vm.prank(alice);
        uint256 tokenId = marginCall.openPosition(assetId, ONE_NVDAC, V1Config.LEVERAGE_1_25X, 0);
        assertEq(marginCall.ownerOf(tokenId), alice);
    }

    /// @dev The stateless backstop that does hold without any operator: once the frozen round ages past
    ///      MAX_LIVE_AGE it is refused regardless of whether the halt was ever observed.
    function test_frozenRoundIsRefusedOnceItAgesOut() public {
        registry.setPaused(true);
        registry.setPaused(false);
        vm.warp(OracleFixtures.NVDA_UPDATED_AT + V1Config.MAX_LIVE_AGE + 1);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MarginCall.OracleNotLive.selector, IOracleAdapter.State.INVALID));
        marginCall.openPosition(assetId, ONE_NVDAC, V1Config.LEVERAGE_1_25X, 0);
    }

    function _setRound(uint80 roundId, uint256 startedAt, uint256 updatedAt) private {
        feed.set(roundId, int256(BaseV1Constants.PINNED_FEED_ANSWER), startedAt, updatedAt, roundId);
    }
}
