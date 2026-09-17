// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {V1Config} from "../../src/V1Config.sol";

/// @title MaintenanceFixtures
/// @notice Test-only helpers for constructing marks at a chosen debt-to-NAV ratio.
/// @dev Lives in `fixtures/` because the RPC-free suites reach it through `MarginCallTestBase` while the fork
///      suites cannot inherit that base and import this directly. The maintenance *rule* itself is not here:
///      `V1Config.isHealthy` / `isLiquidatable` is shared with the contract so no suite can encode the 30%
///      threshold differently. This library only inverts the valuation to place a fixture on either side of it.
library MaintenanceFixtures {
    /// @dev Positive equity but strictly below the 30% maintenance ratio: liquidatable, not yet underwater.
    uint256 internal constant LIQUIDATABLE_DEBT_SHARE_BPS = 7_500;
    /// @dev Underwater: `debt >= NAV`, so proceeds cannot cover debt and the remainder is bad debt.
    uint256 internal constant UNDERWATER_DEBT_SHARE_BPS = 11_000;

    /// @notice Choose a feed price so that `debt / NAV ≈ debtShareBps / 10_000`.
    /// @dev NAV = stock * price / 10^10, so price = debt * 10^10 * 10_000 / (stock * debtShareBps).
    function priceForDebtShare(uint256 stock, uint256 debt, uint256 debtShareBps) internal pure returns (uint256) {
        return (debt * V1Config.VALUATION_DENOMINATOR * V1Config.BPS_DENOMINATOR) / (stock * debtShareBps);
    }

    /// @notice The smallest feed price at which `stock` against `debt` is still healthy; equality is safe.
    /// @dev Derived from `V1Config` rather than a literal so a change to the maintenance ratio cannot leave a
    ///      fixture sitting off the threshold it claims to pin.
    function minHealthyPrice(uint256 stock, uint256 debt) internal pure returns (uint256) {
        uint256 minHealthyNav = Math.ceilDiv(
            debt * V1Config.BPS_DENOMINATOR, V1Config.BPS_DENOMINATOR - V1Config.MAINTENANCE_EQUITY_RATIO_BPS
        );
        return Math.ceilDiv(minHealthyNav * V1Config.VALUATION_DENOMINATOR, stock);
    }
}
