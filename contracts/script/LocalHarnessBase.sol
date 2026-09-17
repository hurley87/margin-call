// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {HarnessBase} from "./HarnessBase.sol";

/// @title LocalHarnessBase
/// @notice Shared scaffolding for the local-Anvil-only signer smoke harnesses.
/// @dev Adds the Anvil chain pin to `HarnessBase`, which owns the burn assertion. Each harness owns
///      its own deployment, broadcast steps, and inspection output.
abstract contract LocalHarnessBase is HarnessBase {
    uint256 internal constant ANVIL_CHAIN_ID = 31337;
    uint256 internal constant DEFAULT_STOCK_AMOUNT = 1e8;

    error LocalAnvilOnly(uint256 actualChainId, uint256 requiredChainId);

    /// @dev Refuse to run anywhere but local Anvil. These harnesses deploy mocks and seed credit.
    function _requireLocalAnvil() internal view {
        if (block.chainid != ANVIL_CHAIN_ID) {
            revert LocalAnvilOnly(block.chainid, ANVIL_CHAIN_ID);
        }
    }
}
