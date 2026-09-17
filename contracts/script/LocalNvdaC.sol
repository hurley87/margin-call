// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {BaseV1Constants} from "../test/fixtures/BaseV1Constants.sol";

/// @title LocalNvdaC
/// @notice Dev/test-only 8-decimal ERC-20 for the local Anvil Position NFT smoke harness.
/// @dev Not production NVDAc. Never deploy this token on a live chain. Production NVDAc on Base is
///      `0xb20000000000000000000078ee7ce2fE4908108C`.
contract LocalNvdaC is ERC20 {
    constructor() ERC20("Local NVDAc (dev)", "NVDAc") {}

    function decimals() public pure override returns (uint8) {
        return BaseV1Constants.NVDAC_DECIMALS;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
