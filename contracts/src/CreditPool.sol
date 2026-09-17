// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ICreditPool} from "./interfaces/ICreditPool.sol";

/// @title CreditPool
/// @notice Protocol-owned USDC that may be lent only to a single immutable `MarginCall` borrower.
/// @dev No ERC-4626 shares, public LP deposits/withdrawals, or free USDC borrowing surface.
contract CreditPool is ICreditPool {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error UnauthorizedBorrower(address caller);
    error InsufficientCredit(uint256 requested, uint256 available);

    IERC20 public immutable override USDC;
    address public immutable override borrower;

    constructor(address usdc_, address borrower_) {
        if (usdc_ == address(0) || borrower_ == address(0)) {
            revert ZeroAddress();
        }
        USDC = IERC20(usdc_);
        borrower = borrower_;
    }

    /// @notice Liquid USDC available for financed openings.
    function availableCredit() external view override returns (uint256) {
        return USDC.balanceOf(address(this));
    }

    /// @notice Transfer `amount` USDC to the immutable borrower. Reverts if capacity is insufficient.
    function draw(uint256 amount) external override {
        if (msg.sender != borrower) {
            revert UnauthorizedBorrower(msg.sender);
        }
        uint256 available = USDC.balanceOf(address(this));
        if (amount > available) {
            revert InsufficientCredit(amount, available);
        }
        USDC.safeTransfer(borrower, amount);
    }
}
