// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Protocol-owned USDC credit that may be drawn only by `MarginCall`.
interface ICreditPool {
    function USDC() external view returns (IERC20);
    function borrower() external view returns (address);
    function availableCredit() external view returns (uint256);
    function draw(uint256 amount) external;
}
