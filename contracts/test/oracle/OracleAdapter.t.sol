// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";

import {OracleAdapter} from "../../src/OracleAdapter.sol";
import {IOracleAdapter} from "../../src/interfaces/IOracleAdapter.sol";
import {BaseV1Constants} from "../fixtures/BaseV1Constants.sol";
import {OracleFixtures} from "../fixtures/OracleFixtures.sol";

contract MockAggregator {
    uint80 public roundId;
    int256 public answer;
    uint256 public startedAt;
    uint256 public updatedAt;
    uint80 public answeredInRound;
    bool public shouldRevert;

    function set(uint80 roundId_, int256 answer_, uint256 startedAt_, uint256 updatedAt_, uint80 answeredInRound_)
        external
    {
        roundId = roundId_;
        answer = answer_;
        startedAt = startedAt_;
        updatedAt = updatedAt_;
        answeredInRound = answeredInRound_;
    }

    function setShouldRevert(bool shouldRevert_) external {
        shouldRevert = shouldRevert_;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        if (shouldRevert) {
            revert("feed down");
        }
        return (roundId, answer, startedAt, updatedAt, answeredInRound);
    }
}

contract MockRegistry {
    bool public paused;
    bool public shouldRevert;

    function setPaused(bool paused_) external {
        paused = paused_;
    }

    function setShouldRevert(bool shouldRevert_) external {
        shouldRevert = shouldRevert_;
    }

    function getOracleParams(address) external view returns (uint256 multiplier, bool paused_) {
        if (shouldRevert) {
            revert("registry down");
        }
        return (1e18, paused);
    }
}

/// @dev RPC-free production OracleAdapter semantics, including held-round persistence.
contract OracleAdapterTest is Test {
    address internal constant STOCK = address(0xB20);

    MockAggregator internal feed;
    MockRegistry internal registry;
    MockAggregator internal sequencer;
    OracleAdapter internal oracle;

    function setUp() public {
        feed = new MockAggregator();
        registry = new MockRegistry();
        sequencer = new MockAggregator();
        oracle = new OracleAdapter(STOCK, address(feed), address(registry), address(sequencer));

        _setLiveFixtures();
        vm.warp(BaseV1Constants.PINNED_TIMESTAMP);
    }

    function test_liveObservation() public {
        assertEq(oracle.STOCK(), STOCK);
        assertEq(address(oracle.FEED()), address(feed));

        IOracleAdapter.Observation memory obs = oracle.latestObservation();
        assertEq(uint256(obs.state), uint256(IOracleAdapter.State.LIVE));
        assertEq(obs.price, BaseV1Constants.PINNED_FEED_ANSWER);
        assertEq(obs.roundId, OracleFixtures.NVDA_ROUND_ID);
        assertEq(obs.updatedAt, OracleFixtures.NVDA_UPDATED_AT);
    }

    function test_heldPersistsFrozenRoundAndBlocksUntilFresh() public {
        registry.setPaused(true);
        // A committing call is what records the hold; a plain read classifies without persisting.
        IOracleAdapter.Observation memory held = oracle.refresh();
        assertEq(uint256(held.state), uint256(IOracleAdapter.State.HELD));
        assertTrue(oracle.hasObservedHold());
        assertEq(oracle.heldRoundId(), OracleFixtures.NVDA_ROUND_ID);
        assertEq(oracle.heldUpdatedAt(), OracleFixtures.NVDA_UPDATED_AT);

        registry.setPaused(false);
        IOracleAdapter.Observation memory stillInvalid = oracle.latestObservation();
        assertEq(uint256(stillInvalid.state), uint256(IOracleAdapter.State.INVALID));

        feed.set(
            OracleFixtures.NVDA_ROUND_ID + 1,
            int256(BaseV1Constants.PINNED_FEED_ANSWER),
            OracleFixtures.NVDA_STARTED_AT + 60,
            OracleFixtures.NVDA_UPDATED_AT + 60,
            OracleFixtures.NVDA_ROUND_ID + 1
        );
        IOracleAdapter.Observation memory live = oracle.latestObservation();
        assertEq(uint256(live.state), uint256(IOracleAdapter.State.LIVE));
        assertEq(live.roundId, OracleFixtures.NVDA_ROUND_ID + 1);
    }

    function test_latestObservationNeverPersistsTheHold() public {
        registry.setPaused(true);
        IOracleAdapter.Observation memory held = oracle.latestObservation();
        assertEq(uint256(held.state), uint256(IOracleAdapter.State.HELD), "read still classifies the hold");

        // The read is a view, so nothing was recorded and `lastRefreshedAt` did not move.
        assertFalse(oracle.hasObservedHold(), "read must not persist");
        assertEq(oracle.heldRoundId(), 0);
        assertEq(oracle.heldUpdatedAt(), 0);
        assertEq(oracle.lastRefreshedAt(), 0);
    }

    function test_refreshRecordsTheHoldAndAdvancesOnlyForwards() public {
        registry.setPaused(true);
        vm.expectEmit(false, false, false, true, address(oracle));
        emit OracleAdapter.HoldObserved(OracleFixtures.NVDA_ROUND_ID, OracleFixtures.NVDA_UPDATED_AT);
        oracle.refresh();
        assertEq(oracle.lastRefreshedAt(), block.timestamp);

        // A second refresh on the same frozen round keeps the existing checkpoint.
        oracle.refresh();
        assertEq(oracle.heldRoundId(), OracleFixtures.NVDA_ROUND_ID);
        assertEq(oracle.heldUpdatedAt(), OracleFixtures.NVDA_UPDATED_AT);

        // A newer round observed while still paused moves the checkpoint forward.
        feed.set(
            OracleFixtures.NVDA_ROUND_ID + 5,
            int256(BaseV1Constants.PINNED_FEED_ANSWER),
            OracleFixtures.NVDA_STARTED_AT + 120,
            OracleFixtures.NVDA_UPDATED_AT + 120,
            OracleFixtures.NVDA_ROUND_ID + 5
        );
        oracle.refresh();
        assertEq(oracle.heldRoundId(), OracleFixtures.NVDA_ROUND_ID + 5);
        assertEq(oracle.heldUpdatedAt(), OracleFixtures.NVDA_UPDATED_AT + 120);
    }

    function test_refreshOnLiveLeavesTheHoldStateAlone() public {
        oracle.refresh();
        assertEq(oracle.lastRefreshedAt(), block.timestamp);
        assertFalse(oracle.hasObservedHold(), "a LIVE refresh records no hold");
        assertEq(oracle.heldRoundId(), 0);
    }

    function test_refreshDuringDeadFeedHoldRecordsNoJunkCheckpoint() public {
        registry.setPaused(true);
        feed.setShouldRevert(true);
        IOracleAdapter.Observation memory held = oracle.refresh();
        assertEq(uint256(held.state), uint256(IOracleAdapter.State.HELD));

        // The round was never read, so there is nothing trustworthy to checkpoint.
        assertFalse(oracle.hasObservedHold(), "unread round must not become the checkpoint");
        assertEq(oracle.heldRoundId(), 0);
        assertEq(oracle.heldUpdatedAt(), 0);
    }

    function test_staleIsInvalid() public {
        vm.warp(OracleFixtures.NVDA_UPDATED_AT + BaseV1Constants.MAX_LIVE_AGE + 1);
        IOracleAdapter.Observation memory obs = oracle.latestObservation();
        assertEq(uint256(obs.state), uint256(IOracleAdapter.State.INVALID));
    }

    function test_sequencerDownIsInvalid() public {
        sequencer.set(
            OracleFixtures.SEQUENCER_ROUND_ID,
            1,
            BaseV1Constants.PINNED_TIMESTAMP - 10_000,
            BaseV1Constants.PINNED_TIMESTAMP - 10_000,
            OracleFixtures.SEQUENCER_ROUND_ID
        );
        IOracleAdapter.Observation memory obs = oracle.latestObservation();
        assertEq(uint256(obs.state), uint256(IOracleAdapter.State.INVALID));
    }

    function test_sequencerGraceIsInvalid() public {
        sequencer.set(
            OracleFixtures.SEQUENCER_ROUND_ID,
            0,
            BaseV1Constants.PINNED_TIMESTAMP - BaseV1Constants.SEQUENCER_GRACE_PERIOD,
            BaseV1Constants.PINNED_TIMESTAMP - BaseV1Constants.SEQUENCER_GRACE_PERIOD,
            OracleFixtures.SEQUENCER_ROUND_ID
        );
        IOracleAdapter.Observation memory obs = oracle.latestObservation();
        assertEq(uint256(obs.state), uint256(IOracleAdapter.State.INVALID));
    }

    function test_failedRegistryIsInvalidEvenIfPausedFlagWouldBeHeld() public {
        registry.setPaused(true);
        registry.setShouldRevert(true);
        IOracleAdapter.Observation memory obs = oracle.latestObservation();
        assertEq(uint256(obs.state), uint256(IOracleAdapter.State.INVALID));
    }

    function test_failedFeedIsInvalidWhenUnpaused() public {
        feed.setShouldRevert(true);
        IOracleAdapter.Observation memory obs = oracle.latestObservation();
        assertEq(uint256(obs.state), uint256(IOracleAdapter.State.INVALID));
    }

    function test_valueUsdcMatchesPinnedNormalization() public view {
        assertEq(oracle.valueUsdc(1e8, BaseV1Constants.PINNED_FEED_ANSWER), 211_785_000);
        assertEq(oracle.valueUsdc(125_000_000, 22_000_000_000), 275_000_000);
    }

    function _setLiveFixtures() private {
        feed.set(
            OracleFixtures.NVDA_ROUND_ID,
            int256(BaseV1Constants.PINNED_FEED_ANSWER),
            OracleFixtures.NVDA_STARTED_AT,
            OracleFixtures.NVDA_UPDATED_AT,
            OracleFixtures.NVDA_ROUND_ID
        );
        sequencer.set(
            OracleFixtures.SEQUENCER_ROUND_ID,
            0,
            OracleFixtures.SEQUENCER_STARTED_AT,
            OracleFixtures.SEQUENCER_UPDATED_AT,
            OracleFixtures.SEQUENCER_ROUND_ID
        );
        registry.setPaused(false);
    }
}
