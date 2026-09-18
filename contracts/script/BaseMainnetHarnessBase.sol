// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {StdCheats} from "forge-std/StdCheats.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CreditPool} from "../src/CreditPool.sol";
import {ExecutionAdapter} from "../src/ExecutionAdapter.sol";
import {LaunchAssets} from "../src/LaunchAssets.sol";
import {MarginCall} from "../src/MarginCall.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {V1Config} from "../src/V1Config.sol";
import {BaseV1Constants} from "../test/fixtures/BaseV1Constants.sol";
import {HarnessBase} from "./HarnessBase.sol";

/// @title BaseMainnetHarnessBase
/// @notice Shared scaffolding for Base-mainnet deploy and acceptance scripts (issue #429).
/// @dev Hard-requires `block.chainid == 8453`. Never weakens Anvil-only local harnesses.
///      Inherits `StdCheats` (not only `StdCheatsSafe`) so dry-run can `deal` ERC-20 balances on a fork.
///      Owns `_deployV1Stack` so the live deploy and the dry-run acceptance build the same stack.
abstract contract BaseMainnetHarnessBase is HarnessBase, StdCheats {
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
    error DryRunRequired();
    error LiveBroadcastForbiddenInDryRun();

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

    /// @dev The one definition of the multi-stock stack with a single NVDAc registration. `DeployV1` broadcasts
    ///      it; `AcceptV1.dryRunFull` simulates it, so the dry run always rehearses the stack the script ships.
    ///      Live V1 on Base (`deployments/base.json`) remains the prior NVDA-only deploy and is not rewritten here.
    ///      `ASSET_ADMIN` is `msg.sender` so registration works both under broadcast (operator) and dry-run (script).
    function _deployV1Stack(address treasury)
        internal
        returns (
            OracleAdapter oracle,
            ExecutionAdapter execution,
            MarginCall marginCall,
            CreditPool pool,
            uint256 nvdaAssetId
        )
    {
        oracle = new OracleAdapter(
            LaunchAssets.NVDAC,
            LaunchAssets.NVDA_FEED,
            V1Config.COINBASE_ORACLE_REGISTRY,
            V1Config.BASE_SEQUENCER_UPTIME_FEED
        );
        execution = new ExecutionAdapter(
            V1Config.USDC, LaunchAssets.NVDAC, V1Config.UNISWAP_SWAP_ROUTER_02, LaunchAssets.NVDA_UNISWAP_FEE
        );
        marginCall = new MarginCall(V1Config.USDC, msg.sender);
        pool = new CreditPool(V1Config.USDC, address(marginCall), treasury);
        marginCall.setCreditPool(address(pool));
        nvdaAssetId = marginCall.addAsset(LaunchAssets.NVDAC, address(oracle), address(execution));
    }

    /// @dev The reduceExposure sale size. Shared so the dry run sells the same fraction as the live phase.
    function _reduceSale(uint256 stock) internal pure returns (uint256 sale) {
        sale = (stock * REDUCE_SALE_BPS) / V1Config.BPS_DENOMINATOR;
        if (sale == 0) {
            sale = 1;
        }
    }

    /// @dev The repay overpayment ceiling. `repay` caps at min(amount, currentDebt), so overshooting is safe
    ///      and covers the interest accrued between reading the debt and mining the transaction.
    function _repayCeiling(uint256 remaining) internal pure returns (uint256) {
        return remaining + (remaining * REPAY_BUFFER_BPS) / V1Config.BPS_DENOMINATOR + 1;
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
            require(IERC20(LaunchAssets.NVDAC).transfer(actor, nvdacAmount), "nvdac fund transfer");
        }
    }

    function _usdc() internal pure returns (IERC20) {
        return IERC20(V1Config.USDC);
    }

    function _nvdac() internal pure returns (IERC20) {
        return IERC20(LaunchAssets.NVDAC);
    }
}
