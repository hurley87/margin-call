// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {console} from "forge-std/console.sol";

import {LaunchAssets} from "../src/LaunchAssets.sol";
import {V1Config} from "../src/V1Config.sol";
import {BaseMainnetHarnessBase} from "./BaseMainnetHarnessBase.sol";

/// @title DeployLaunch
/// @notice Base-mainnet-only deploy of the canonical Margin Call launch stack.
/// @dev Deploys one `MarginCall`, one `CreditPool`, and one oracle/execution adapter pair per
///      `LaunchAssets.launchSet()` rail (NVDAc, AAPLc, METAc, GOOGLc). Operator is deployer
///      (`INITIALIZER` + `ASSET_ADMIN`) and `CreditPool.treasury`. Private keys are read from env
///      and never logged. Dry-run: `MARGIN_CALL_DRY_RUN=1` + `--fork-url` without `--broadcast`.
///      Live: require shell gate `CONFIRM_BASE_MAINNET=I_UNDERSTAND` before `--broadcast`.
///
///      Does **not** reproduce the historical NVDA-only deployment recorded in
///      `deployments/base-nvda-only.legacy.json`. Do not merge this run into that file.
contract DeployLaunch is BaseMainnetHarnessBase {
    string internal constant STATE_PATH = "./deployments/base-launch-deploy.run.json";

    struct DeployState {
        address deployer;
        address marginCall;
        address creditPool;
        uint256 chainId;
        string gitCommit;
    }

    /// @notice Deploy MarginCall, CreditPool, and the four launch-set adapter pairs; register every rail.
    function run() external returns (DeployState memory state) {
        _requireBaseMainnet();

        uint256 operatorKey = vm.envUint("OPERATOR_PRIVATE_KEY");
        address operator = vm.addr(operatorKey);
        string memory gitCommit = vm.envOr("MARGIN_CALL_GIT_COMMIT", string("unknown"));
        LaunchAssets.Asset[] memory rails = LaunchAssets.launchSet();

        console.log("=== Base launch DeployLaunch ===");
        console.log("dryRun", _isDryRun());
        console.log("chainId", block.chainid);
        console.log("deployer / assetAdmin / treasury", operator);
        console.log("USDC", V1Config.USDC);
        console.log("REGISTRY", V1Config.COINBASE_ORACLE_REGISTRY);
        console.log("SEQUENCER_FEED", V1Config.BASE_SEQUENCER_UPTIME_FEED);
        console.log("SWAP_ROUTER_02", V1Config.UNISWAP_SWAP_ROUTER_02);
        console.log("launchSet size", rails.length);
        for (uint256 i; i < rails.length; ++i) {
            console.log(rails[i].name, rails[i].stock);
        }

        if (_isDryRun()) {
            _fundDryRunActor(operator, 10 ether, 0);
        }

        vm.startBroadcast(operatorKey);
        LaunchStack memory stack = _deployLaunchStack(operator);
        vm.stopBroadcast();

        _assertLaunchStack(stack, operator, operator);

        state = DeployState({
            deployer: operator,
            marginCall: address(stack.marginCall),
            creditPool: address(stack.pool),
            chainId: block.chainid,
            gitCommit: gitCommit
        });
        _persist(state, stack, rails);

        console.log("marginCall", state.marginCall);
        console.log("creditPool", state.creditPool);
        console.log("assetCount", stack.assetIds.length);
        console.log("state written to", STATE_PATH);
        console.log("=== DeployLaunch complete ===");
        console.log("Do not merge into deployments/base-nvda-only.legacy.json.");
        console.log("After live acceptance, record the curated manifest at deployments/base.json.");
    }

    function _persist(DeployState memory state, LaunchStack memory stack, LaunchAssets.Asset[] memory rails) private {
        string memory obj = "base-launch-deploy";
        vm.serializeAddress(obj, "deployer", state.deployer);
        vm.serializeAddress(obj, "assetAdmin", state.deployer);
        vm.serializeAddress(obj, "treasury", state.deployer);
        vm.serializeAddress(obj, "marginCall", state.marginCall);
        vm.serializeAddress(obj, "creditPool", state.creditPool);
        vm.serializeUint(obj, "chainId", state.chainId);
        vm.serializeString(obj, "gitCommit", state.gitCommit);
        vm.serializeAddress(obj, "usdc", V1Config.USDC);
        vm.serializeAddress(obj, "registry", V1Config.COINBASE_ORACLE_REGISTRY);
        vm.serializeAddress(obj, "sequencerFeed", V1Config.BASE_SEQUENCER_UPTIME_FEED);
        vm.serializeAddress(obj, "swapRouter02", V1Config.UNISWAP_SWAP_ROUTER_02);
        vm.serializeUint(obj, "assetCount", stack.assetIds.length);

        for (uint256 i; i < rails.length; ++i) {
            string memory assetObj = string.concat("asset-", rails[i].name);
            vm.serializeUint(assetObj, "assetId", stack.assetIds[i]);
            vm.serializeAddress(assetObj, "stock", rails[i].stock);
            vm.serializeAddress(assetObj, "oracleAdapter", stack.oracles[i]);
            vm.serializeAddress(assetObj, "executionAdapter", stack.executions[i]);
            vm.serializeAddress(assetObj, "feed", rails[i].feed);
            vm.serializeAddress(assetObj, "uniswapPool", rails[i].pool);
            string memory assetJson = vm.serializeUint(assetObj, "uniswapFee", uint256(rails[i].fee));
            vm.serializeString(obj, rails[i].name, assetJson);
        }

        string memory json = vm.serializeString(obj, "status", "launch-deploy-run");
        vm.writeJson(json, STATE_PATH);
    }
}
