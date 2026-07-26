// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {TraderAccount} from "../src/TraderAccount.sol";
import {TraderDelegation} from "../src/TraderDelegation.sol";
import {TraderIdentity} from "../src/TraderIdentity.sol";

/// @notice Deploy the Floor Trader identity set to Robinhood Chain testnet.
/// @dev The three contracts deploy together because TraderDelegation is bound
///      to a TraderIdentity address at construction, and an account
///      implementation is only meaningful alongside the collection it serves.
///      Splitting them across runs invites a delegation contract pointed at a
///      stale collection.
///
/// Env:
///   TRADER_NAME (optional, default "Margin Call Trader")
///   TRADER_SYMBOL (optional, default "MCTRADER")
///   TRADER_BASE_URI (required — the metadata endpoint, with trailing slash)
contract DeployFloorTrader is Script {
    string internal constant DEFAULT_NAME = "Margin Call Trader";
    string internal constant DEFAULT_SYMBOL = "MCTRADER";

    function run() external {
        string memory name = vm.envOr("TRADER_NAME", string(DEFAULT_NAME));
        string memory symbol = vm.envOr("TRADER_SYMBOL", string(DEFAULT_SYMBOL));
        string memory baseURI = vm.envString("TRADER_BASE_URI");

        vm.startBroadcast();
        TraderIdentity identity = new TraderIdentity(name, symbol, baseURI);
        TraderAccount accountImplementation = new TraderAccount();
        TraderDelegation delegation = new TraderDelegation(address(identity));
        vm.stopBroadcast();

        console2.log("TraderIdentity deployed at:", address(identity));
        console2.log("TraderAccount deployed at:", address(accountImplementation));
        console2.log("TraderDelegation deployed at:", address(delegation));
        console2.log("Name:", name);
        console2.log("Symbol:", symbol);
        console2.log("Base URI:", baseURI);
    }
}
