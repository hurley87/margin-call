// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice ERC-20 double that calls back into custody while custody is paying out.
/// @dev Arm it with the call to attempt; the re-entrant call fires whenever the armed target
///      is the sender, which is exactly the moment custody releases a basket. Reverts are
///      bubbled so the outer transaction fails with the guard's own error.
contract MockReentrantToken is ERC20 {
    address public reentryTarget;
    bytes public reentryCalldata;

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(address target, bytes calldata data) external {
        reentryTarget = target;
        reentryCalldata = data;
    }

    function disarm() external {
        reentryTarget = address(0);
        reentryCalldata = "";
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);

        if (reentryTarget != address(0) && from == reentryTarget) {
            (bool ok, bytes memory returndata) = reentryTarget.call(reentryCalldata);
            if (!ok) {
                assembly {
                    revert(add(returndata, 0x20), mload(returndata))
                }
            }
        }
    }
}
