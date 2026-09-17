// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Script} from "forge-std/Script.sol";
import {StdAssertions} from "forge-std/StdAssertions.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {MarginCall} from "../src/MarginCall.sol";
import {V1Config} from "../src/V1Config.sol";
import {BaseV1Constants} from "../test/fixtures/BaseV1Constants.sol";

/// @title BaseMainnetHarnessBase
/// @notice Shared scaffolding for Base-mainnet deploy and acceptance scripts (issue #429).
/// @dev Hard-requires `block.chainid == 8453`. Never weakens Anvil-only local harnesses.
///      Inherits `StdCheats` (not only `StdCheatsSafe`) so dry-run can `deal` ERC-20 balances on a fork.
abstract contract BaseMainnetHarnessBase is Script, StdCheats, StdAssertions {
    /// @dev Tiny live defaults (overridable via env). 0.01 NVDAc = 1e6 raw (8 decimals).
    uint256 internal constant DEFAULT_STOCK_AMOUNT = 1_000_000;
    uint256 internal constant DEFAULT_CREDIT_SEED = 20e6;
    uint256 internal constant DEFAULT_TREASURY_WITHDRAW = 1e6;
    uint256 internal constant DEFAULT_LEVERAGE = V1Config.LEVERAGE_1_25X;
    /// @dev Small reduceExposure size as a fraction of recorded stock (bps). 500 = 5%.
    uint256 internal constant REDUCE_SALE_BPS = 500;
    /// @dev Overestimate applied to B's final repay (bps). `repay` caps at min(amount, currentDebt).
    uint256 internal constant REPAY_BUFFER_BPS = 100;

    error BaseMainnetOnly(uint256 actualChainId, uint256 requiredChainId);
    error DuplicateWalletRoles(address a, address b);
    error ZeroStockAmount();
    error DryRunRequired();
    error LiveBroadcastForbiddenInDryRun();
    error NftStillExists(uint256 tokenId, address owner);
    error UnexpectedOwnerOfRevert(uint256 tokenId, bytes data);

    /// @dev Refuse every chain except Base mainnet. Blocks Anvil (31337) and Base Sepolia (84532).
    function _requireBaseMainnet() internal view {
        if (block.chainid != V1Config.CHAIN_ID) {
            revert BaseMainnetOnly(block.chainid, V1Config.CHAIN_ID);
        }
    }

    /// @dev A, E, and B must be three distinct addresses so executor-clearing and lost-authority proofs are real.
    function _requireDistinctWallets(address operator, address executor, address recipient) internal pure {
        if (operator == executor) {
            revert DuplicateWalletRoles(operator, executor);
        }
        if (operator == recipient) {
            revert DuplicateWalletRoles(operator, recipient);
        }
        if (executor == recipient) {
            revert DuplicateWalletRoles(executor, recipient);
        }
    }

    function _isDryRun() internal view returns (bool) {
        return vm.envOr("MARGIN_CALL_DRY_RUN", uint256(0)) != 0;
    }

    /// @dev Dry-run fork funding only. USDC via `deal`; NVDAc via transfer from the pinned holder
    ///      (B20 `deal`/balance probes fail under stock forge — see fork harness).
    function _fundDryRunActor(address actor, uint256 ethWei, uint256 usdcAmount, uint256 nvdacAmount) internal {
        if (!_isDryRun()) {
            revert DryRunRequired();
        }
        vm.deal(actor, ethWei);
        if (usdcAmount > 0) {
            deal(V1Config.USDC, actor, usdcAmount);
        }
        if (nvdacAmount > 0) {
            address holder = BaseV1Constants.PINNED_NVDAC_HOLDER;
            vm.prank(holder);
            require(IERC20(V1Config.NVDAC).transfer(actor, nvdacAmount), "nvdac fund transfer");
        }
    }

    function _assertTokenDoesNotExist(MarginCall marginCall, uint256 tokenId) internal view {
        bytes memory expected = abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, tokenId);
        (bool success, bytes memory data) =
            address(marginCall).staticcall(abi.encodeCall(marginCall.ownerOf, (tokenId)));
        if (success) {
            revert NftStillExists(tokenId, abi.decode(data, (address)));
        }
        if (keccak256(data) != keccak256(expected)) {
            revert UnexpectedOwnerOfRevert(tokenId, data);
        }
    }

    function _usdc() internal pure returns (IERC20) {
        return IERC20(V1Config.USDC);
    }

    function _nvdac() internal pure returns (IERC20) {
        return IERC20(V1Config.NVDAC);
    }
}
