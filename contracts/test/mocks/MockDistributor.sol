// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IDistributor} from "../../src/interfaces/IDistributor.sol";

/// @notice No-op Distributor for RipEngine suites that do not assert reward accounting.
contract MockDistributor is IDistributor {
    function onPackEntered(uint256, address) external {}

    function onPackExited(uint256) external {}

    function onRip(address, uint256) external {}
}
