// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {console} from "forge-std/console.sol";

import {CreditPool} from "../src/CreditPool.sol";
import {ExecutionAdapter} from "../src/ExecutionAdapter.sol";
import {MarginCall} from "../src/MarginCall.sol";
import {OracleAdapter} from "../src/OracleAdapter.sol";
import {V1Config} from "../src/V1Config.sol";
import {BaseMainnetHarnessBase} from "./BaseMainnetHarnessBase.sol";

/// @title DeployV1
/// @notice Base-mainnet-only deploy of OracleAdapter, ExecutionAdapter, MarginCall, and CreditPool.
/// @dev Uses pinned #420 / V1Config addresses. Operator is deployer (`INITIALIZER`) and `CreditPool.treasury`.
///      Private keys are read from env and never logged. Dry-run: `MARGIN_CALL_DRY_RUN=1` + `--fork-url` without
///      `--broadcast`. Live: require shell gate `CONFIRM_BASE_MAINNET=I_UNDERSTAND` before `--broadcast`.
contract DeployV1 is BaseMainnetHarnessBase {
    string internal constant STATE_PATH = "./deployments/base-deploy.run.json";

    /// @dev No `treasury` field: the operator is always deployer and treasury, and `pool.treasury()` is
    ///      asserted below. The JSON record still spells it out for readers.
    struct DeployState {
        address deployer;
        address oracle;
        address execution;
        address marginCall;
        address creditPool;
        uint256 chainId;
        string gitCommit;
    }

    /// @notice Deploy the four V1 contracts and wire `setCreditPool` once.
    function run() external returns (DeployState memory state) {
        _requireBaseMainnet();

        uint256 operatorKey = vm.envUint("OPERATOR_PRIVATE_KEY");
        address operator = vm.addr(operatorKey);
        string memory gitCommit = vm.envOr("MARGIN_CALL_GIT_COMMIT", string("unknown"));

        console.log("=== Base mainnet DeployV1 ===");
        console.log("dryRun", _isDryRun());
        console.log("chainId", block.chainid);
        console.log("deployer/treasury", operator);
        console.log("NVDAC", V1Config.NVDAC);
        console.log("USDC", V1Config.USDC);
        console.log("NVDA_FEED", V1Config.NVDA_FEED);
        console.log("REGISTRY", V1Config.COINBASE_ORACLE_REGISTRY);
        console.log("SEQUENCER_FEED", V1Config.BASE_SEQUENCER_UPTIME_FEED);
        console.log("SWAP_ROUTER_02", V1Config.UNISWAP_SWAP_ROUTER_02);
        console.log("UNISWAP_FEE", uint256(V1Config.UNISWAP_FEE));

        if (_isDryRun()) {
            _fundDryRunActor(operator, 10 ether, 0, 0);
        }

        vm.startBroadcast(operatorKey);
        (
            OracleAdapter oracle,
            ExecutionAdapter execution,
            MarginCall marginCall,
            CreditPool pool,
            uint256 nvdaAssetId
        ) = _deployV1Stack(operator);
        vm.stopBroadcast();

        // Immutable / config relationship checks (oracle-independent).
        assertEq(address(marginCall.USDC()), V1Config.USDC, "MarginCall.USDC");
        assertEq(marginCall.INITIALIZER(), operator, "MarginCall.INITIALIZER");
        assertEq(marginCall.ASSET_ADMIN(), operator, "MarginCall.ASSET_ADMIN");
        assertEq(address(marginCall.creditPool()), address(pool), "MarginCall.creditPool");
        assertEq(nvdaAssetId, 1, "nvdaAssetId");
        assertEq(marginCall.assetIdOf(V1Config.NVDAC), nvdaAssetId, "assetIdOf(NVDAC)");
        MarginCall.AssetConfig memory nvda = marginCall.assetConfig(nvdaAssetId);
        assertEq(nvda.stock, V1Config.NVDAC, "assetConfig.stock");
        assertEq(address(nvda.oracle), address(oracle), "assetConfig.oracle");
        assertEq(address(nvda.execution), address(execution), "assetConfig.execution");
        assertTrue(nvda.openingEnabled, "assetConfig.openingEnabled");
        assertEq(address(pool.USDC()), V1Config.USDC, "CreditPool.USDC");
        assertEq(pool.borrower(), address(marginCall), "CreditPool.borrower");
        assertEq(pool.treasury(), operator, "CreditPool.treasury");
        assertEq(address(oracle.STOCK()), V1Config.NVDAC, "OracleAdapter.STOCK");
        assertEq(address(oracle.FEED()), V1Config.NVDA_FEED, "OracleAdapter.FEED");
        assertEq(address(execution.USDC()), V1Config.USDC, "ExecutionAdapter.USDC");
        assertEq(address(execution.STOCK()), V1Config.NVDAC, "ExecutionAdapter.STOCK");
        assertEq(address(execution.ROUTER()), V1Config.UNISWAP_SWAP_ROUTER_02, "ExecutionAdapter.ROUTER");
        assertEq(uint256(execution.FEE()), uint256(V1Config.UNISWAP_FEE), "ExecutionAdapter.FEE");

        state = DeployState({
            deployer: operator,
            oracle: address(oracle),
            execution: address(execution),
            marginCall: address(marginCall),
            creditPool: address(pool),
            chainId: block.chainid,
            gitCommit: gitCommit
        });
        _persist(state);

        console.log("oracle", state.oracle);
        console.log("execution", state.execution);
        console.log("marginCall", state.marginCall);
        console.log("creditPool", state.creditPool);
        console.log("state written to", STATE_PATH);
        console.log("=== DeployV1 complete ===");
    }

    function _persist(DeployState memory state) private {
        string memory obj = "base-deploy";
        vm.serializeAddress(obj, "deployer", state.deployer);
        vm.serializeAddress(obj, "treasury", state.deployer);
        vm.serializeAddress(obj, "oracle", state.oracle);
        vm.serializeAddress(obj, "execution", state.execution);
        vm.serializeAddress(obj, "marginCall", state.marginCall);
        vm.serializeAddress(obj, "creditPool", state.creditPool);
        vm.serializeUint(obj, "chainId", state.chainId);
        vm.serializeString(obj, "gitCommit", state.gitCommit);
        vm.serializeAddress(obj, "nvdac", V1Config.NVDAC);
        vm.serializeAddress(obj, "usdc", V1Config.USDC);
        vm.serializeAddress(obj, "nvdaFeed", V1Config.NVDA_FEED);
        vm.serializeAddress(obj, "registry", V1Config.COINBASE_ORACLE_REGISTRY);
        vm.serializeAddress(obj, "sequencerFeed", V1Config.BASE_SEQUENCER_UPTIME_FEED);
        vm.serializeAddress(obj, "swapRouter02", V1Config.UNISWAP_SWAP_ROUTER_02);
        string memory json = vm.serializeUint(obj, "uniswapFee", uint256(V1Config.UNISWAP_FEE));
        vm.writeJson(json, STATE_PATH);
    }
}
