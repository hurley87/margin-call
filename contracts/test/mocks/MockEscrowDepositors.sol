// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockEscrowDepositors {
    mapping(uint256 => address) public depositors;

    function setDepositor(uint256 traderId, address depositor) external {
        depositors[traderId] = depositor;
    }
}
