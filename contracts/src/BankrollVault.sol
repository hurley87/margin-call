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

    uint256 internal constant SAFETY_BUFFER_NUMERATOR = 20;
    uint256 internal constant SAFETY_BUFFER_DENOMINATOR = 100;

    /// @notice Total maximum payouts reserved for unresolved player tickets.
    /// @dev Reservation mutation is restricted to the future game-only entry and settlement paths.
    uint256 public reservedLiabilities;

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

    /// @notice Returns the minimum gross-asset buffer that remains in the vault after LP withdrawals.
    /// @dev Rounds up so the buffer is never below 20% of gross assets.
    function safetyBuffer() public view returns (uint256) {
        return _safetyBuffer(grossAssets());
    }

    function _safetyBuffer(uint256 assets) internal pure returns (uint256) {
        return assets.mulDiv(SAFETY_BUFFER_NUMERATOR, SAFETY_BUFFER_DENOMINATOR, Math.Rounding.Ceil);
    }

    /// @notice Returns gross assets available for LP withdrawal after reservations and the safety buffer.
    /// @dev Reservations transitively cover pending obligations and unrecognized margin: a reservation is
    ///      consumed only when its payout or refund actually transfers, so `pendingObligations +
    ///      unrecognizedMargin` never exceeds `reservedLiabilities` (technical design §8). The game-only
    ///      mutation paths must preserve that invariant; subtracting those terms here as well would
    ///      double-count liabilities and suppress valid LP withdrawals.
    function freeLiquidity() public view returns (uint256) {
        uint256 assets = grossAssets();
        uint256 protectedAssets = reservedLiabilities + _safetyBuffer(assets);

        return assets > protectedAssets ? assets - protectedAssets : 0;
    }

    /// @notice Returns the owner's immediately executable asset withdrawal limit.
    /// @dev This cap preserves ERC-4626 conversions while partitioning free liquidity by share ownership.
    function maxWithdraw(address owner) public view override returns (uint256) {
        (uint256 maxAssets,) = _withdrawalLimits(owner);
        return maxAssets;
    }

    /// @notice Returns the owner's immediately executable share redemption limit.
    /// @dev Inverts ERC-4626's virtual-share `previewRedeem` rounding so this is the greatest share amount whose
    ///      redeemed assets do not exceed `maxWithdraw(owner)`.
    function maxRedeem(address owner) public view override returns (uint256) {
        uint256 ownerShares = balanceOf(owner);
        (uint256 maxAssets, uint256 ownerAssets) = _withdrawalLimits(owner);

        if (maxAssets == ownerAssets) return ownerShares;

        uint256 maxShares = _convertToShares(maxAssets + 1, Math.Rounding.Ceil) - 1;
        return Math.min(ownerShares, maxShares);
    }

    /// @dev Shared by `maxWithdraw` and `maxRedeem` so the owner's limit and full asset value come from one
    ///      set of balance and supply reads.
    function _withdrawalLimits(address owner) internal view returns (uint256 maxAssets, uint256 ownerAssets) {
        uint256 supply = totalSupply();
        if (supply == 0) return (0, 0);

        uint256 ownerShares = balanceOf(owner);
        ownerAssets = convertToAssets(ownerShares);
        maxAssets = Math.min(ownerAssets, freeLiquidity().mulDiv(ownerShares, supply));
    }
}
