// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {console} from "forge-std/console.sol";

import {BaseMainnetHarnessBase} from "./BaseMainnetHarnessBase.sol";

/// @title Actors
/// @notice Derive Base launch wallet addresses from env keys without putting a key on a child argv.
/// @dev `cast wallet address` can only take a key as an argv value (world-readable via `ps`) or from an
///      interactive TTY, so the wrappers read addresses from here instead: forge reads the keys through
///      `vm.envUint`. Prints addresses only — never a key. Chain-independent: derivation needs no RPC.
contract Actors is BaseMainnetHarnessBase {
    /// @notice Print the operator (deployer / asset admin / treasury) as `ACTOR operator <address>`.
    function printOperator() external view {
        address operator = vm.addr(vm.envUint("OPERATOR_PRIVATE_KEY"));
        console.log(string.concat("ACTOR operator ", vm.toString(operator)));
    }

    /// @notice Print A, E, and B as `ACTOR <role> <address>` lines. Unused by compact launch acceptance;
    ///         retained so a later three-wallet live flow can derive addresses the same safe way.
    function printActors() external view {
        address alice = vm.addr(vm.envUint("OPERATOR_PRIVATE_KEY"));
        address executor = vm.addr(vm.envUint("EXECUTOR_PRIVATE_KEY"));
        address bob = vm.addr(vm.envUint("RECIPIENT_PRIVATE_KEY"));
        _requireDistinctWallets(alice, executor, bob);

        console.log(string.concat("ACTOR alice ", vm.toString(alice)));
        console.log(string.concat("ACTOR executor ", vm.toString(executor)));
        console.log(string.concat("ACTOR bob ", vm.toString(bob)));
    }
}
