// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {console} from "forge-std/console.sol";

import {V1Config} from "../src/V1Config.sol";
import {BaseMainnetHarnessBase} from "./BaseMainnetHarnessBase.sol";

/// @title RedeployCoordinator
/// @notice Base-mainnet-only redeploy of the coordinator pair (`MarginCall` + `CreditPool`) onto the
///         already-deployed curated adapters recorded in `deployments/base.json`.
/// @dev The living Position NFT slice changed `MarginCall`'s storage and `openPosition` signature, and neither
///      is upgradeable, so the coordinator has to be redeployed. `CreditPool.borrower` is immutable, which
///      forces a new pool along with it. The oracle and execution adapters are *not* redeployed: they hold no
///      position state, they are already source-verified, and their addresses appear in the curated manifest.
///
///      There is no migration for positions on the previous coordinator. Those NFTs stay manageable at their
///      old address; the frontend simply stops opening there. Seed credit into the **new** pool — idle USDC on
///      the old pool is withdrawn by its treasury, not migrated.
///
///      Dry-run: `MARGIN_CALL_DRY_RUN=1` + `--fork-url` without `--broadcast`.
///      Live: require shell gate `CONFIRM_BASE_MAINNET=I_UNDERSTAND` before `--broadcast`.
contract RedeployCoordinator is BaseMainnetHarnessBase {
    string internal constant STATE_PATH = "./deployments/base-coordinator-redeploy.run.json";

    struct RedeployState {
        address deployer;
        address marginCall;
        address creditPool;
        uint256 chainId;
        string gitCommit;
    }

    /// @notice Deploy MarginCall + CreditPool and register the curated rails against their existing adapters.
    function run() external returns (RedeployState memory state) {
        _requireBaseMainnet();

        uint256 operatorKey = vm.envUint("OPERATOR_PRIVATE_KEY");
        address operator = vm.addr(operatorKey);
        string memory gitCommit = vm.envOr("MARGIN_CALL_GIT_COMMIT", string("unknown"));
        CuratedAsset[] memory curated = _loadCuratedAssets();

        console.log("=== Base coordinator RedeployCoordinator ===");
        console.log("dryRun", _isDryRun());
        console.log("chainId", block.chainid);
        console.log("deployer / assetAdmin / treasury", operator);
        console.log("reusing adapters from", CANONICAL_MANIFEST_PATH);
        for (uint256 i; i < curated.length; ++i) {
            console.log(curated[i].name, curated[i].oracle, curated[i].execution);
        }

        if (_isDryRun()) {
            _fundDryRunActor(operator, 10 ether, 0);
        }

        vm.startBroadcast(operatorKey);
        LaunchStack memory stack = _deployCoordinatorOnly(operator, curated);
        vm.stopBroadcast();

        _assertLaunchStack(stack, operator, operator);
        _assertCuratedAdaptersReused(stack, curated);

        state = RedeployState({
            deployer: operator,
            marginCall: address(stack.marginCall),
            creditPool: address(stack.pool),
            chainId: block.chainid,
            gitCommit: gitCommit
        });
        _persist(state, curated);

        console.log("marginCall", state.marginCall);
        console.log("creditPool", state.creditPool);
        console.log("state written to", STATE_PATH);
        console.log("=== RedeployCoordinator complete ===");
        console.log("Next: seed the NEW CreditPool, run live acceptance, then rewrite deployments/base.json.");
        console.log("Also reset the Convex read model to the new coordinator before the frontend ships.");
    }

    function _persist(RedeployState memory state, CuratedAsset[] memory curated) private {
        string memory obj = "base-coordinator-redeploy";
        vm.serializeAddress(obj, "deployer", state.deployer);
        vm.serializeAddress(obj, "assetAdmin", state.deployer);
        vm.serializeAddress(obj, "treasury", state.deployer);
        vm.serializeAddress(obj, "marginCall", state.marginCall);
        vm.serializeAddress(obj, "creditPool", state.creditPool);
        vm.serializeUint(obj, "chainId", state.chainId);
        vm.serializeString(obj, "gitCommit", state.gitCommit);
        vm.serializeAddress(obj, "usdc", V1Config.USDC);
        vm.serializeBool(obj, "adaptersRedeployed", false);
        vm.serializeUint(obj, "assetCount", curated.length);

        for (uint256 i; i < curated.length; ++i) {
            string memory assetObj = string.concat("asset-", curated[i].name);
            vm.serializeUint(assetObj, "assetId", curated[i].assetId);
            vm.serializeAddress(assetObj, "stock", curated[i].stock);
            vm.serializeAddress(assetObj, "oracleAdapter", curated[i].oracle);
            string memory assetJson = vm.serializeAddress(assetObj, "executionAdapter", curated[i].execution);
            vm.serializeString(obj, curated[i].name, assetJson);
        }

        string memory json = vm.serializeString(obj, "status", "coordinator-redeploy-run");
        vm.writeJson(json, STATE_PATH);
    }
}
