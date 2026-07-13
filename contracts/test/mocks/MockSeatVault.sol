// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Minimal mock for MarginCallEscrow seat-vault binding tests.
contract MockSeatVault {
    mapping(uint256 => bool) private _locked;

    function setLocked(uint256 traderId, bool locked) external {
        _locked[traderId] = locked;
    }

    function hasLockedPrincipal(uint256 traderId) external view returns (bool) {
        return _locked[traderId];
    }
}
