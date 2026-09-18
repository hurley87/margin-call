// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {StdCheats} from "forge-std/StdCheats.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CreditPool} from "../src/CreditPool.sol";
import {ExecutionAdapter} from "../src/ExecutionAdapter.sol";
import {IOracleAdapter} from "../src/interfaces/IOracleAdapter.sol";
import {LaunchAssets} from "../src/LaunchAssets.sol";
import {MarginCall} from "../src/MarginCall.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {V1Config} from "../src/V1Config.sol";
import {HarnessBase} from "./HarnessBase.sol";

/// @title BaseMainnetHarnessBase
/// @notice Shared scaffolding for the canonical Base launch deploy and acceptance scripts.
/// @dev Hard-requires `block.chainid == 8453`. Never weakens Anvil-only local harnesses.
///      Inherits `StdCheats` (not only `StdCheatsSafe`) so dry-run can `deal` ERC-20 balances on a fork.
///      Owns `_deployLaunchStack` so live deploy and dry-run acceptance build the same stack.
abstract contract BaseMainnetHarnessBase is HarnessBase, StdCheats {
    /// @dev Tiny live defaults (overridable via env). 0.01 stock = 1e6 raw (8 decimals).
    uint256 internal constant DEFAULT_STOCK_AMOUNT = 1_000_000;
    uint256 internal constant DEFAULT_CREDIT_SEED = 20e6;
    uint256 internal constant DEFAULT_TREASURY_WITHDRAW = 1e6;
    uint256 internal constant DEFAULT_LEVERAGE = V1Config.LEVERAGE_1_25X;
    /// @dev Overestimate applied to the final repay (bps). `repay` caps at min(amount, currentDebt).
    uint256 internal constant REPAY_BUFFER_BPS = 100;
    /// @dev Current qualified launch-set size. `LaunchAssets.launchSet()` is the rail source of truth;
    ///      this constant only fails the deploy closed if the table and this pin drift.
    uint256 internal constant LAUNCH_ASSET_COUNT = 4;

    /// @dev Curated manifest the frontend consumes. Coordinator redeploys reuse its adapters verbatim.
    string internal constant CANONICAL_MANIFEST_PATH = "./deployments/base.json";

    error BaseMainnetOnly(uint256 actualChainId, uint256 requiredChainId);
    error DuplicateWalletRoles(address a, address b);
    error DryRunRequired();
    error LiveBroadcastForbiddenInDryRun();
    error LaunchSetSizeMismatch(uint256 actual, uint256 expected);
    error OracleNotLive(uint8 state);
    error CuratedAssetIdDrift(string name, uint256 expected, uint256 actual);
    error CuratedManifestMalformed();

    struct LaunchStack {
        MarginCall marginCall;
        CreditPool pool;
        address[] oracles;
        address[] executions;
        uint256[] assetIds;
    }

    /// @dev One curated rail as already deployed and recorded in `deployments/base.json`.
    struct CuratedAsset {
        string name;
        uint256 assetId;
        address stock;
        address oracle;
        address execution;
    }

    /// @dev Refuse every chain except Base mainnet. Blocks Anvil (31337) and Base Sepolia (84532).
    function _requireBaseMainnet() internal view {
        if (block.chainid != V1Config.CHAIN_ID) {
            revert BaseMainnetOnly(block.chainid, V1Config.CHAIN_ID);
        }
    }

    /// @dev Kept for the optional three-wallet derivation helper. Compact launch acceptance is operator-only.
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

    /// @dev The one definition of the canonical launch stack: one `MarginCall`, one `CreditPool`, and one
    ///      oracle/execution adapter pair per `LaunchAssets.launchSet()` rail. `DeployLaunch` broadcasts it;
    ///      `AcceptLaunch.dryRunFull` simulates it. `ASSET_ADMIN` is the explicit `treasury` argument (the
    ///      operator), not the script's `msg.sender` — during `startBroadcast` those differ, and using
    ///      `msg.sender` would brick `addAsset`. This does **not** reproduce the historical NVDA-only
    ///      deployment in `deployments/base-nvda-only.legacy.json`.
    function _deployLaunchStack(address treasury) internal returns (LaunchStack memory stack) {
        LaunchAssets.Asset[] memory rails = LaunchAssets.launchSet();
        uint256 n = rails.length;
        if (n != LAUNCH_ASSET_COUNT) {
            revert LaunchSetSizeMismatch(n, LAUNCH_ASSET_COUNT);
        }

        stack.marginCall = new MarginCall(V1Config.USDC, treasury);
        stack.pool = new CreditPool(V1Config.USDC, address(stack.marginCall), treasury);
        stack.marginCall.setCreditPool(address(stack.pool));

        stack.oracles = new address[](n);
        stack.executions = new address[](n);
        stack.assetIds = new uint256[](n);

        for (uint256 i; i < n; ++i) {
            OracleAdapter oracle = new OracleAdapter(
                rails[i].stock, rails[i].feed, V1Config.COINBASE_ORACLE_REGISTRY, V1Config.BASE_SEQUENCER_UPTIME_FEED
            );
            ExecutionAdapter execution =
                new ExecutionAdapter(V1Config.USDC, rails[i].stock, V1Config.UNISWAP_SWAP_ROUTER_02, rails[i].fee);
            stack.oracles[i] = address(oracle);
            stack.executions[i] = address(execution);
            stack.assetIds[i] = stack.marginCall.addAsset(rails[i].stock, address(oracle), address(execution));
        }
    }

    /// @dev The curated rails exactly as `deployments/base.json` records them.
    ///      Read from the manifest rather than hardcoded so a coordinator redeploy cannot silently point at
    ///      adapters the frontend does not use.
    function _loadCuratedAssets() internal view returns (CuratedAsset[] memory curated) {
        string memory json = vm.readFile(CANONICAL_MANIFEST_PATH);

        // Entries are read by index rather than a `[*]` wildcard: the typed array cheatcodes reject
        // multi-value paths, and indexing keeps manifest order — which is assetId order — explicit.
        uint256 n;
        while (vm.keyExistsJson(json, _curatedAssetPath(n, ".name"))) {
            ++n;
        }
        if (n != LAUNCH_ASSET_COUNT) {
            revert CuratedManifestMalformed();
        }

        curated = new CuratedAsset[](n);
        for (uint256 i; i < n; ++i) {
            curated[i] = CuratedAsset({
                name: vm.parseJsonString(json, _curatedAssetPath(i, ".name")),
                assetId: vm.parseJsonUint(json, _curatedAssetPath(i, ".assetId")),
                stock: vm.parseJsonAddress(json, _curatedAssetPath(i, ".stock")),
                oracle: vm.parseJsonAddress(json, _curatedAssetPath(i, ".oracleAdapter")),
                execution: vm.parseJsonAddress(json, _curatedAssetPath(i, ".executionAdapter"))
            });
        }
    }

    function _curatedAssetPath(uint256 index, string memory field) private pure returns (string memory) {
        return string.concat(".assets[", vm.toString(index), "]", field);
    }

    /// @dev Redeploy only the coordinator pair, reusing the curated adapters.
    ///
    ///      `CreditPool.borrower` is immutable, so a new `MarginCall` always needs a new pool — but the oracle
    ///      and execution adapters hold no position state and are already source-verified, so redeploying them
    ///      would only churn addresses the frontend and every operator runbook already trust.
    ///
    ///      Registration order is asserted against the manifest: `assetId` is baked into every existing
    ///      Position and into the app's assetId-to-ticker mapping, so a reordered registry would silently
    ///      relabel positions.
    function _deployCoordinatorOnly(address treasury, CuratedAsset[] memory curated)
        internal
        returns (LaunchStack memory stack)
    {
        uint256 n = curated.length;
        if (n != LAUNCH_ASSET_COUNT) {
            revert LaunchSetSizeMismatch(n, LAUNCH_ASSET_COUNT);
        }

        stack.marginCall = new MarginCall(V1Config.USDC, treasury);
        stack.pool = new CreditPool(V1Config.USDC, address(stack.marginCall), treasury);
        stack.marginCall.setCreditPool(address(stack.pool));

        stack.oracles = new address[](n);
        stack.executions = new address[](n);
        stack.assetIds = new uint256[](n);

        for (uint256 i; i < n; ++i) {
            stack.oracles[i] = curated[i].oracle;
            stack.executions[i] = curated[i].execution;
            uint256 assetId = stack.marginCall.addAsset(curated[i].stock, curated[i].oracle, curated[i].execution);
            if (assetId != curated[i].assetId) {
                revert CuratedAssetIdDrift(curated[i].name, curated[i].assetId, assetId);
            }
            stack.assetIds[i] = assetId;
        }
    }

    /// @dev Pins the property that makes a coordinator redeploy a redeploy and not a fresh launch: every
    ///      registered adapter is the address already recorded in the curated manifest.
    function _assertCuratedAdaptersReused(LaunchStack memory stack, CuratedAsset[] memory curated) internal view {
        for (uint256 i; i < curated.length; ++i) {
            MarginCall.AssetConfig memory cfg = stack.marginCall.assetConfig(curated[i].assetId);
            assertEq(cfg.stock, curated[i].stock, "curated stock");
            assertEq(address(cfg.oracle), curated[i].oracle, "curated oracle reused");
            assertEq(address(cfg.execution), curated[i].execution, "curated execution reused");
        }
    }

    /// @dev Shared relationship + rail checks. Deploy and dry-run acceptance cannot assert a different registry.
    function _assertLaunchStack(LaunchStack memory stack, address initializer, address treasury) internal view {
        LaunchAssets.Asset[] memory rails = LaunchAssets.launchSet();
        uint256 n = rails.length;
        if (n != LAUNCH_ASSET_COUNT) {
            revert LaunchSetSizeMismatch(n, LAUNCH_ASSET_COUNT);
        }

        assertEq(address(stack.marginCall.USDC()), V1Config.USDC, "MarginCall.USDC");
        assertEq(stack.marginCall.INITIALIZER(), initializer, "MarginCall.INITIALIZER");
        assertEq(stack.marginCall.ASSET_ADMIN(), initializer, "MarginCall.ASSET_ADMIN");
        assertEq(address(stack.marginCall.creditPool()), address(stack.pool), "MarginCall.creditPool");
        assertEq(stack.marginCall.assetCount(), n, "assetCount");
        assertEq(address(stack.pool.USDC()), V1Config.USDC, "CreditPool.USDC");
        assertEq(stack.pool.borrower(), address(stack.marginCall), "CreditPool.borrower");
        assertEq(stack.pool.treasury(), treasury, "CreditPool.treasury");

        for (uint256 i; i < n; ++i) {
            uint256 assetId = stack.marginCall.assetAt(i);
            assertEq(assetId, i + 1, "assetAt order");
            assertEq(stack.assetIds[i], assetId, "recorded assetId");
            assertEq(stack.marginCall.assetIdOf(rails[i].stock), assetId, "assetIdOf");

            MarginCall.AssetConfig memory cfg = stack.marginCall.assetConfig(assetId);
            assertEq(cfg.stock, rails[i].stock, "assetConfig.stock");
            assertEq(address(cfg.oracle), stack.oracles[i], "assetConfig.oracle");
            assertEq(address(cfg.execution), stack.executions[i], "assetConfig.execution");
            assertTrue(cfg.openingEnabled, "assetConfig.openingEnabled");

            OracleAdapter oracle = OracleAdapter(stack.oracles[i]);
            ExecutionAdapter execution = ExecutionAdapter(stack.executions[i]);
            assertEq(address(oracle.STOCK()), rails[i].stock, "oracle.STOCK");
            assertEq(address(oracle.FEED()), rails[i].feed, "oracle.FEED");
            assertEq(address(oracle.REGISTRY()), V1Config.COINBASE_ORACLE_REGISTRY, "oracle.REGISTRY");
            assertEq(address(oracle.SEQUENCER_FEED()), V1Config.BASE_SEQUENCER_UPTIME_FEED, "oracle.SEQUENCER");
            assertEq(address(execution.USDC()), V1Config.USDC, "execution.USDC");
            assertEq(address(execution.STOCK()), rails[i].stock, "execution.STOCK");
            assertEq(address(execution.ROUTER()), V1Config.UNISWAP_SWAP_ROUTER_02, "execution.ROUTER");
            assertEq(uint256(execution.FEE()), uint256(rails[i].fee), "execution.FEE");
        }
    }

    /// @dev The repay overpayment ceiling. `repay` caps at min(amount, currentDebt), so overshooting is safe
    ///      and covers the interest accrued between reading the debt and mining the transaction.
    function _repayCeiling(uint256 remaining) internal pure returns (uint256) {
        return remaining + (remaining * REPAY_BUFFER_BPS) / V1Config.BPS_DENOMINATOR + 1;
    }

    /// @dev Dry-run fork funding only. ETH via `vm.deal`; USDC via `deal`. Never used on a live broadcast.
    function _fundDryRunActor(address actor, uint256 ethWei, uint256 usdcAmount) internal {
        if (!_isDryRun()) {
            revert DryRunRequired();
        }
        vm.deal(actor, ethWei);
        if (usdcAmount > 0) {
            deal(V1Config.USDC, actor, usdcAmount);
        }
    }

    /// @dev Pull demo-size stock from the Uniswap pool on this local fork only. Does not touch production.
    function _fundDryRunStock(address actor, LaunchAssets.Asset memory rail, uint256 amount) internal {
        if (!_isDryRun()) {
            revert DryRunRequired();
        }
        vm.prank(rail.pool);
        require(IERC20(rail.stock).transfer(actor, amount), "stock fund transfer");
    }

    function _usdc() internal pure returns (IERC20) {
        return IERC20(V1Config.USDC);
    }

    function _requireLive(OracleAdapter oracle) internal view {
        IOracleAdapter.Observation memory obs = oracle.latestObservation();
        if (obs.state != IOracleAdapter.State.LIVE) {
            revert OracleNotLive(uint8(obs.state));
        }
    }
}
