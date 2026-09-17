// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {console} from "forge-std/console.sol";

import {BaseMainnetHarnessBase} from "./BaseMainnetHarnessBase.sol";

/// @title Actors
/// @notice Derive the three Base-mainnet acceptance addresses (A, E, B) from the env keys (issue #429).
/// @dev Exists so shell wrappers never place a private key on a child process command line.
///      `cast wallet address` can only take a key as an argv value (world-readable via `ps`) or from an
///      interactive TTY, so the wrappers read addresses from here instead: forge reads the keys through
///      `vm.envUint`, which keeps them in the process environment rather than in the process arguments.
///      Prints addresses only — never a key. Chain-independent: derivation needs no RPC.
contract Actors is BaseMainnetHarnessBase {
    /// @notice Print A, E, and B as `ACTOR <role> <address>` lines for the wrappers to parse.
    /// @dev Also enforces the three-distinct-wallets rule here, so the shell does not need its own copy.
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
