// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {GameToken} from "../src/GameToken.sol";

/// @notice Drives the token the way V1 does: fund the Distributor, pay claimants, and let users try
///         (and fail) to move tokens between themselves. Never exercises the enable switch, so the
///         suite is a statement about the locked regime the token actually ships in.
contract GameTokenHandler is Test {
    GameToken public token;
    address public treasury;
    address public distributor;
    address public admin;

    /// @dev Ghost: set if any user↔user transfer ever succeeded while the lock was on.
    bool public ghostLockedTransferSucceeded;

    /// @dev Ghost: number of user↔user transfers rejected by the lock.
    uint256 public ghostLockedTransferReverted;

    /// @dev Ghost: cumulative tokens paid out of the Distributor.
    uint256 public ghostPaidOut;

    address[] internal actors;

    constructor(GameToken token_, address admin_, address treasury_, address distributor_) {
        token = token_;
        admin = admin_;
        treasury = treasury_;
        distributor = distributor_;
        actors.push(makeAddr("claimant0"));
        actors.push(makeAddr("claimant1"));
        actors.push(makeAddr("claimant2"));
    }

    function fundDistributor(uint256 amountSeed) external {
        uint256 balance = token.balanceOf(treasury);
        if (balance == 0) return;

        uint256 amount = bound(amountSeed, 1, balance);
        vm.prank(treasury);
        token.transfer(distributor, amount);
    }

    function payout(uint256 actorSeed, uint256 amountSeed) external {
        uint256 balance = token.balanceOf(distributor);
        if (balance == 0) return;

        address to = actors[bound(actorSeed, 0, actors.length - 1)];
        uint256 amount = bound(amountSeed, 1, balance);
        vm.prank(distributor);
        token.transfer(to, amount);
        ghostPaidOut += amount;
    }

    function tryUserTransfer(uint256 fromSeed, uint256 toSeed, uint256 amountSeed) external {
        address from = actors[bound(fromSeed, 0, actors.length - 1)];
        address to = actors[bound(toSeed, 0, actors.length - 1)];
        if (from == to) return;

        uint256 balance = token.balanceOf(from);
        if (balance == 0) return;

        uint256 amount = bound(amountSeed, 1, balance);
        bool wasLocked = !token.transfersEnabled();

        vm.prank(from);
        try token.transfer(to, amount) {
            if (wasLocked) ghostLockedTransferSucceeded = true;
        } catch {
            if (wasLocked) ghostLockedTransferReverted += 1;
        }
    }

    /// @dev Claimants must not be able to push tokens into the Distributor while locked — that
    ///      would burn them, since `sweep` cannot recover the game token.
    function tryReturnToDistributor(uint256 actorSeed, uint256 amountSeed) external {
        address from = actors[bound(actorSeed, 0, actors.length - 1)];
        uint256 balance = token.balanceOf(from);
        if (balance == 0) return;

        uint256 amount = bound(amountSeed, 1, balance);
        bool wasLocked = !token.transfersEnabled();

        vm.prank(from);
        try token.transfer(distributor, amount) {
            if (wasLocked) ghostLockedTransferSucceeded = true;
        } catch {
            if (wasLocked) ghostLockedTransferReverted += 1;
        }
    }

    function scheduleEnable() external {
        if (token.transferEnableEta() != 0) return;
        vm.prank(admin);
        token.scheduleTransferEnable();
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function actorAt(uint256 i) external view returns (address) {
        return actors[i];
    }
}

contract GameTokenInvariantTest is StdInvariant, Test {
    GameToken public token;
    GameTokenHandler public handler;

    address admin = makeAddr("admin");
    address treasury = makeAddr("treasury");
    address distributor = makeAddr("distributor");

    uint256 constant SUPPLY = 1_000_000_000e18;

    function setUp() public {
        token = new GameToken(admin, treasury, SUPPLY);
        bytes32 distributorRole = token.DISTRIBUTOR_ROLE();
        vm.prank(admin);
        token.grantRole(distributorRole, distributor);

        handler = new GameTokenHandler(token, admin, treasury, distributor);
        targetContract(address(handler));
    }

    /// @notice Fixed supply: there is no mint path, so the deploy mint is the only supply event.
    function invariant_totalSupplyIsFixed() public view {
        assertEq(token.totalSupply(), SUPPLY);
    }

    /// @notice Every token is accounted for across treasury, Distributor, and claimants.
    function invariant_balancesSumToSupply() public view {
        uint256 sum = token.balanceOf(treasury) + token.balanceOf(distributor);
        uint256 n = handler.actorCount();
        for (uint256 i; i < n; ++i) {
            sum += token.balanceOf(handler.actorAt(i));
        }
        assertEq(sum, SUPPLY);
    }

    /// @notice No transfer out of a claimant ever settles while the lock is on — not to another
    ///         claimant, and not into the Distributor.
    function invariant_claimantTransfersNeverSettleWhileLocked() public view {
        assertFalse(handler.ghostLockedTransferSucceeded());
    }

    /// @notice Scheduling the switch — on its own — never unlocks the token.
    function invariant_schedulingAloneNeverUnlocks() public view {
        assertFalse(token.transfersEnabled());
    }

    /// @notice Claimants only ever hold tokens the Distributor actually paid them.
    /// @dev Their only inflow is a Distributor payout and their only outflow returns tokens to it,
    ///      so their combined balance can never outrun cumulative payouts.
    function invariant_claimantHoldingsBackedByPayouts() public view {
        uint256 held;
        uint256 n = handler.actorCount();
        for (uint256 i; i < n; ++i) {
            held += token.balanceOf(handler.actorAt(i));
        }
        assertLe(held, handler.ghostPaidOut());
    }
}
