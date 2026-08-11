// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {inco} from "@inco/lightning/src/Lib.sol";

import {MarginCallCrash} from "../src/MarginCallCrash.sol";
import {Utils} from "./utils/Utils.sol";

/// @notice Deploys MarginCallCrash on a minute-aligned Base Sepolia epoch.
/// @dev The curated deployment record is input only. A successful run writes the gitignored
///      `deployments/base_sepolia.margin_call_crash.run.json` record for deliberate merging.
contract DeployMarginCallCrash is Utils {
    error InvalidDeploymentRecord();
    error DeploymentPostconditionFailed();
    error InvalidEpochOrigin(uint256 epochOrigin, uint256 minimumEpochOrigin);

    string internal constant OUTPUT_NAME = OUTPUT_BASE_SEPOLIA_CRASH_RUN;
    string internal constant INCO_PACKAGE_VERSION = "1.0.2";
    uint256 internal constant MINIMUM_EPOCH_LEAD_TIME = 5 minutes;

    struct ExistingDeployment {
        uint256 chainId;
        address deployer;
    }

    struct Deployment {
        uint256 chainId;
        address deployer;
        address marginCallCrash;
        address incoLightning;
        uint64 epochOrigin;
        uint64 roundDuration;
        uint64 entryWindow;
        uint64 expiryDelay;
    }

    /// @notice Broadcasts the Crash game deployment from the recorded release deployer.
    function run() external returns (Deployment memory deployment) {
        _requireBaseSepolia();
        ExistingDeployment memory existing = existingDeployment();
        _validateExistingDeployment(existing);
        uint64 epochOrigin = configuredEpochOrigin();

        vm.startBroadcast(existing.deployer);
        deployment = _deploy(existing.deployer, epochOrigin);
        vm.stopBroadcast();

        writeOutput(deploymentRecord(deployment), OUTPUT_NAME);
    }

    /// @notice Reads only the non-secret curated Base Sepolia release record.
    function existingDeployment() public view returns (ExistingDeployment memory existing) {
        string memory record = readInput(OUTPUT_BASE_SEPOLIA);
        existing = ExistingDeployment({
            chainId: vm.parseJsonUint(record, ".chainId"), deployer: vm.parseJsonAddress(record, ".deployer")
        });
    }

    /// @notice Returns the non-secret provenance record written after a successful run.
    function deploymentRecord(Deployment memory deployment) public pure returns (string memory) {
        string memory record = string.concat(
            "{\n",
            '  "chainId": ',
            vm.toString(deployment.chainId),
            ",\n",
            '  "deployer": "',
            vm.toString(deployment.deployer),
            '",\n',
            '  "marginCallCrash": "',
            vm.toString(deployment.marginCallCrash),
            '"'
        );
        record = string.concat(
            record,
            ",\n",
            '  "incoLightning": "',
            vm.toString(deployment.incoLightning),
            '",\n',
            '  "incoPackageVersion": "',
            INCO_PACKAGE_VERSION,
            '",\n',
            '  "epochOrigin": ',
            vm.toString(deployment.epochOrigin),
            ","
        );
        record = string.concat(
            record,
            "\n",
            '  "roundDuration": ',
            vm.toString(deployment.roundDuration),
            ",\n",
            '  "entryWindow": ',
            vm.toString(deployment.entryWindow),
            ",\n",
            '  "expiryDelay": ',
            vm.toString(deployment.expiryDelay),
            ","
        );
        return string.concat(
            record,
            "\n",
            '  "openRoundSelector": "',
            vm.toString(abi.encodePacked(MarginCallCrash.openRound.selector)),
            '",\n',
            '  "requestRevealSelector": "',
            vm.toString(abi.encodePacked(MarginCallCrash.requestReveal.selector)),
            '",\n',
            '  "finalizeRoundSelector": "',
            vm.toString(abi.encodePacked(MarginCallCrash.finalizeRound.selector)),
            '",\n',
            '  "expireRoundSelector": "',
            vm.toString(abi.encodePacked(MarginCallCrash.expireRound.selector)),
            '",\n',
            '  "verification": {\n',
            '    "marginCallCrash": "',
            BASESCAN_ADDRESS_PREFIX,
            vm.toString(deployment.marginCallCrash),
            BASESCAN_CODE_SUFFIX,
            '"\n',
            "  }\n",
            "}\n"
        );
    }

    /// @notice Reads and validates the minute-aligned launch timestamp supplied for this release.
    function configuredEpochOrigin() public view returns (uint64) {
        uint256 configured = vm.envUint("MARGIN_CALL_EPOCH_ORIGIN");
        _validateEpochOrigin(configured);
        // Validation bounds the configured timestamp before narrowing.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint64(configured);
    }

    function _deploy(address deployer, uint64 epochOrigin) internal returns (Deployment memory deployment) {
        _validateEpochOrigin(epochOrigin);
        MarginCallCrash game = new MarginCallCrash(epochOrigin);

        deployment = Deployment({
            chainId: block.chainid,
            deployer: deployer,
            marginCallCrash: address(game),
            incoLightning: address(inco),
            epochOrigin: epochOrigin,
            roundDuration: game.roundDuration(),
            entryWindow: game.entryWindow(),
            expiryDelay: game.expiryDelay()
        });

        _assertPostconditions(game, deployment);
    }

    function _validateExistingDeployment(ExistingDeployment memory existing) internal pure {
        if (existing.chainId != CHAIN_ID_BASE_SEPOLIA || existing.deployer == address(0)) {
            revert InvalidDeploymentRecord();
        }
    }

    function _assertPostconditions(MarginCallCrash game, Deployment memory deployment) internal view {
        if (
            deployment.chainId != CHAIN_ID_BASE_SEPOLIA || deployment.deployer == address(0)
                || deployment.marginCallCrash.code.length == 0 || deployment.incoLightning != address(inco)
                || deployment.epochOrigin % 60 != 0 || game.epochOrigin() != deployment.epochOrigin
                || deployment.roundDuration != 60 || deployment.entryWindow != 45
                || deployment.expiryDelay != 15 minutes
        ) revert DeploymentPostconditionFailed();
    }

    function _validateEpochOrigin(uint256 epochOrigin) internal view {
        uint256 minimumEpochOrigin = block.timestamp + MINIMUM_EPOCH_LEAD_TIME;
        if (epochOrigin > type(uint64).max || epochOrigin < minimumEpochOrigin || epochOrigin % 60 != 0) {
            revert InvalidEpochOrigin(epochOrigin, minimumEpochOrigin);
        }
    }
}
