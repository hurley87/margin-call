// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice ERC-20 double that skims a fee on every transfer between accounts.
/// @dev Exists to prove custody records what it actually received rather than what the caller
///      declared. Mints and burns are not skimmed.
contract MockFeeOnTransferToken is ERC20 {
    uint256 public constant BPS_DENOMINATOR = 10_000;

    address public immutable feeSink;
    uint256 public immutable feeBps;

    constructor(string memory name_, string memory symbol_, uint256 feeBps_, address feeSink_) ERC20(name_, symbol_) {
        require(feeBps_ <= BPS_DENOMINATOR, "fee > 100%");
        require(feeSink_ != address(0), "zero fee sink");
        feeBps = feeBps_;
        feeSink = feeSink_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0) || feeBps == 0) {
            super._update(from, to, value);
            return;
        }

        uint256 fee = (value * feeBps) / BPS_DENOMINATOR;
        if (fee > 0) {
            super._update(from, feeSink, fee);
        }
        super._update(from, to, value - fee);
    }
}
