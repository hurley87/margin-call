// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice ERC-4626 LP share vault for Desk Dollars.
/// @dev This deposits-only slice deliberately leaves game accounting at zero. Future game-only operations
///      will update the accounting state without changing the standard ERC-4626 conversion functions.
contract BankrollVault is ERC4626 {
    using Math for uint256;

    error WithdrawalsDisabledInDepositsOnlySlice();

    /// @notice Records an LP deposit or mint with both parties needed to reconstruct share ownership.
    event VaultDeposit(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);

    /// @notice Payouts owed from finalized or expired tickets but not yet transferred.
    uint256 public pendingObligations;

    /// @notice Received player margin that has not yet been recognized as vault value.
    uint256 public unrecognizedMargin;

    constructor(IERC20 asset_) ERC20("Margin Call Bankroll Share", "mcLP") ERC4626(asset_) {}

    /// @notice Returns the live Desk Dollars balance held by this vault before liability accounting.
    function grossAssets() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    /// @notice Returns net assets used by all standard ERC-4626 conversions and previews.
    function totalAssets() public view override returns (uint256) {
        return grossAssets() - pendingObligations - unrecognizedMargin;
    }

    /// @notice Returns net asset value per whole share, scaled by the vault's share decimals.
    /// @dev An empty vault deterministically returns one asset unit per share (10 ** decimals()).
    function assetsPerShare() external view returns (uint256) {
        uint256 supply = totalSupply();
        uint256 scale = 10 ** decimals();

        return supply == 0 ? scale : totalAssets().mulDiv(scale, supply);
    }

    /// @notice Withdrawals are intentionally unavailable until the free-liquidity controls ship.
    function withdraw(uint256, address, address) public pure override returns (uint256) {
        revert WithdrawalsDisabledInDepositsOnlySlice();
    }

    /// @notice Redemptions are intentionally unavailable until the free-liquidity controls ship.
    function redeem(uint256, address, address) public pure override returns (uint256) {
        revert WithdrawalsDisabledInDepositsOnlySlice();
    }

    /// @notice Returns zero while withdrawals are disabled for this slice.
    function maxWithdraw(address) public pure override returns (uint256) {
        return 0;
    }

    /// @notice Returns zero while redemptions are disabled for this slice.
    function maxRedeem(address) public pure override returns (uint256) {
        return 0;
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        super._deposit(caller, receiver, assets, shares);
        emit VaultDeposit(caller, receiver, assets, shares);
    }
}
