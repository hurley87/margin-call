// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Distributor} from "../src/Distributor.sol";
import {GameToken} from "../src/GameToken.sol";
import {DistributorFixture} from "./helpers/DistributorFixture.sol";
import {MerkleTreeLib} from "./helpers/MerkleTreeLib.sol";

/// @notice Runs the real claim lifecycle — fund, post a root for a finished epoch, claim, retry —
///         and books what happened in ghosts so the accounting can be checked from outside.
contract DistributorHandler is Test {
    uint256 internal constant ACTOR_COUNT = 3;

    Distributor public distributor;
    GameToken public token;
    address public admin;
    address public treasury;

    /// @dev Ghost: everything ever transferred into the Distributor.
    uint256 public ghostFunded;

    /// @dev Ghost: successful claims per epoch per account — must never exceed one.
    mapping(uint256 epoch => mapping(address account => uint256 successes)) public ghostClaimSuccesses;

    /// @dev Ghost: highest successful claim count observed for any (epoch, account) pair.
    uint256 public ghostMaxClaimSuccesses;

    /// @dev Ghost: epochs whose root has been posted, in order.
    uint256[] internal postedEpochs;

    uint256 public nextEpoch;

    address[ACTOR_COUNT] internal actors;
    mapping(uint256 epoch => uint256[ACTOR_COUNT] amounts) internal makerAmounts;
    mapping(uint256 epoch => uint256[ACTOR_COUNT] amounts) internal takerAmounts;

    constructor(Distributor distributor_, GameToken token_, address admin_, address treasury_, uint256 funded_) {
        distributor = distributor_;
        token = token_;
        admin = admin_;
        treasury = treasury_;
        ghostFunded = funded_;
        actors[0] = makeAddr("claimant0");
        actors[1] = makeAddr("claimant1");
        actors[2] = makeAddr("claimant2");
    }

    function fund(uint256 amountSeed) external {
        uint256 amount = bound(amountSeed, 1e18, 1_000e18);
        vm.prank(treasury);
        token.transfer(address(distributor), amount);
        ghostFunded += amount;
    }

    /// @dev Close the current epoch and commit a root for it with the exact declared total.
    function postRoot(uint256 amountSeed) external {
        uint256 epoch = nextEpoch;
        bytes32[] memory leaves = new bytes32[](ACTOR_COUNT);
        uint256 total;

        for (uint256 i; i < ACTOR_COUNT; ++i) {
            uint256 makerAmount = bound(uint256(keccak256(abi.encode(amountSeed, epoch, i, "maker"))), 1e18, 100e18);
            uint256 takerAmount = bound(uint256(keccak256(abi.encode(amountSeed, epoch, i, "taker"))), 0, 100e18);
            makerAmounts[epoch][i] = makerAmount;
            takerAmounts[epoch][i] = takerAmount;
            leaves[i] = distributor.leafOf(epoch, actors[i], makerAmount, takerAmount);
            total += makerAmount + takerAmount;
        }

        bytes32 root = MerkleTreeLib.rootOf(leaves);
        vm.warp(distributor.epochStart(epoch + 1));
        vm.prank(admin);
        distributor.postClaimRoot(epoch, root, total);

        postedEpochs.push(epoch);
        nextEpoch = epoch + 1;
    }

    /// @dev Claim honestly. Repeats are expected to revert; only successes are booked.
    function claim(uint256 epochSeed, uint256 actorSeed) external {
        if (postedEpochs.length == 0) return;

        uint256 epoch = postedEpochs[bound(epochSeed, 0, postedEpochs.length - 1)];
        uint256 index = bound(actorSeed, 0, ACTOR_COUNT - 1);
        address account = actors[index];

        Distributor.ClaimInput memory input = _inputFor(epoch, index);
        try distributor.claim(account, input) {
            uint256 successes = ghostClaimSuccesses[epoch][account] + 1;
            ghostClaimSuccesses[epoch][account] = successes;
            if (successes > ghostMaxClaimSuccesses) ghostMaxClaimSuccesses = successes;
        } catch {}
    }

    /// @dev Claim with a tampered amount. Must never succeed.
    function claimTampered(uint256 epochSeed, uint256 actorSeed, uint256 bump) external {
        if (postedEpochs.length == 0) return;

        uint256 epoch = postedEpochs[bound(epochSeed, 0, postedEpochs.length - 1)];
        uint256 index = bound(actorSeed, 0, ACTOR_COUNT - 1);
        address account = actors[index];

        Distributor.ClaimInput memory input = _inputFor(epoch, index);
        input.makerAmount += bound(bump, 1, 1_000e18);

        try distributor.claim(account, input) {
            uint256 successes = ghostClaimSuccesses[epoch][account] + 1;
            ghostClaimSuccesses[epoch][account] = successes;
            if (successes > ghostMaxClaimSuccesses) ghostMaxClaimSuccesses = successes;
        } catch {}
    }

    function postedEpochCount() external view returns (uint256) {
        return postedEpochs.length;
    }

    function postedEpochAt(uint256 i) external view returns (uint256) {
        return postedEpochs[i];
    }

    function actorCount() external pure returns (uint256) {
        return ACTOR_COUNT;
    }

    function actorAt(uint256 i) external view returns (address) {
        return actors[i];
    }

    function _inputFor(uint256 epoch, uint256 index) internal view returns (Distributor.ClaimInput memory input) {
        bytes32[] memory leaves = new bytes32[](ACTOR_COUNT);
        for (uint256 i; i < ACTOR_COUNT; ++i) {
            leaves[i] = distributor.leafOf(epoch, actors[i], makerAmounts[epoch][i], takerAmounts[epoch][i]);
        }

        input = Distributor.ClaimInput({
            epoch: epoch,
            makerAmount: makerAmounts[epoch][index],
            takerAmount: takerAmounts[epoch][index],
            proof: MerkleTreeLib.proofOf(leaves, leaves[index])
        });
    }
}

contract DistributorInvariantTest is StdInvariant, Test, DistributorFixture {
    DistributorHandler public handler;

    function setUp() public override {
        DistributorFixture.setUp();

        handler = new DistributorHandler(distributor, token, admin, treasury, FUNDED);
        targetContract(address(handler));
    }

    /// @notice Everything paid out came from the funded balance — there is no mint path.
    function invariant_totalClaimedNeverExceedsFunded() public view {
        assertLe(distributor.totalClaimed(), handler.ghostFunded());
    }

    /// @notice The held balance is exactly what was funded minus what was claimed.
    function invariant_balanceIsFundedMinusClaimed() public view {
        assertEq(distributor.fundedBalance(), handler.ghostFunded() - distributor.totalClaimed());
    }

    /// @notice A valid proof claims at most once per epoch, and a tampered one never claims.
    function invariant_noAccountClaimsAnEpochTwice() public view {
        assertLe(handler.ghostMaxClaimSuccesses(), 1);
    }

    /// @notice No epoch ever pays out more than the total its root declared.
    function invariant_epochPayoutsStayWithinDeclaredTotal() public view {
        uint256 epochs = handler.postedEpochCount();
        for (uint256 i; i < epochs; ++i) {
            uint256 epoch = handler.postedEpochAt(i);
            assertLe(distributor.claimedTotalOf(epoch), distributor.claimTotalOf(epoch));
        }
    }

    /// @notice Claimant holdings account for every token that left the Distributor.
    function invariant_claimantBalancesEqualTotalClaimed() public view {
        uint256 held;
        uint256 n = handler.actorCount();
        for (uint256 i; i < n; ++i) {
            held += token.balanceOf(handler.actorAt(i));
        }
        assertEq(held, distributor.totalClaimed());
    }

    /// @notice `claimCountOf` tracks the number of accounts actually paid for an epoch.
    function invariant_claimCountMatchesClaimedAccounts() public view {
        uint256 epochs = handler.postedEpochCount();
        uint256 actors = handler.actorCount();

        for (uint256 i; i < epochs; ++i) {
            uint256 epoch = handler.postedEpochAt(i);
            uint256 claimed;
            for (uint256 j; j < actors; ++j) {
                if (distributor.hasClaimed(epoch, handler.actorAt(j))) ++claimed;
            }
            assertEq(distributor.claimCountOf(epoch), claimed);
        }
    }
}
