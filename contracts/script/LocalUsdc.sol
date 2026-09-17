// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {BaseV1Constants} from "../test/fixtures/BaseV1Constants.sol";

/// @title LocalUsdc
/// @notice Dev/test-only 6-decimal USDC for local Anvil harnesses. Not production USDC.
contract LocalUsdc is ERC20 {
    constructor() ERC20("Local USDC (dev)", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return BaseV1Constants.USDC_DECIMALS;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
