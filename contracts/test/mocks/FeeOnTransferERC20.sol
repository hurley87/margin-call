// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MockERC20} from "./MockERC20.sol";

/// @dev Transfers burn 1% fee to simulate fee-on-transfer tokens.
contract FeeOnTransferERC20 is MockERC20 {
    uint256 public constant FEE_BPS = 100; // 1%

    constructor(string memory name, string memory symbol) MockERC20(name, symbol, 18) {}

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = (value * FEE_BPS) / 10_000;
            if (fee > 0) {
                super._update(from, address(0), fee);
                value -= fee;
            }
        }
        super._update(from, to, value);
    }
}
