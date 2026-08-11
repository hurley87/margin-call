// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {inco} from "@inco/lightning/src/Lib.sol";

import {BankrollVault} from "../src/BankrollVault.sol";
import {IBankrollVault} from "../src/interfaces/IBankrollVault.sol";
import {MarginCallCrash} from "../src/MarginCallCrash.sol";
import {Utils} from "./utils/Utils.sol";

/// @notice Deploys MarginCallCrash on a minute-aligned Base Sepolia epoch and authorizes it on the vault.
/// @dev The curated deployment record is input only. A successful run writes the gitignored
///      `deployments/base_sepolia.margin_call_crash.run.json` record for deliberate merging.
contract DeployMarginCallCrash is Utils {
    error InvalidDeploymentRecord();
    error DeploymentPostconditionFailed();
    error InvalidEpochOrigin(uint256 epochOrigin, uint256 minimumEpochOrigin);
    error VaultAlreadyAuthorized(address authorizedGame);

    string internal constant OUTPUT_NAME = OUTPUT_BASE_SEPOLIA_CRASH_RUN;
    string internal constant INCO_PACKAGE_VERSION = "1.0.2";
    uint256 internal constant MINIMUM_EPOCH_LEAD_TIME = 5 minutes;

    struct ExistingDeployment {
        uint256 chainId;
        address deployer;
        address bankrollVault;
    }

    struct Deployment {
        uint256 chainId;
        address deployer;
        address marginCallCrash;
        address bankrollVault;
        address incoLightning;
        uint64 epochOrigin;
        uint64 roundDuration;
        uint64 entryWindow;
        uint64 expiryDelay;
    }

    /// @notice Broadcasts the Crash game deployment and set-once vault authorization.
    function run() external returns (Deployment memory deployment) {
        _requireBaseSepolia();
        ExistingDeployment memory existing = existingDeployment();
        _validateExistingDeployment(existing);
        uint64 epochOrigin = configuredEpochOrigin();

        vm.startBroadcast(existing.deployer);
        deployment = _deploy(existing, epochOrigin);
        vm.stopBroadcast();

        writeOutput(deploymentRecord(deployment), OUTPUT_NAME);
    }

    /// @notice Reads only the non-secret curated Base Sepolia release record.
    function existingDeployment() public view returns (ExistingDeployment memory existing) {
        string memory record = readInput(OUTPUT_BASE_SEPOLIA);
        existing = ExistingDeployment({
            chainId: vm.parseJsonUint(record, ".chainId"),
            deployer: vm.parseJsonAddress(record, ".deployer"),
            bankrollVault: vm.parseJsonAddress(record, ".bankrollVault")
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
            '",\n',
            '  "bankrollVault": "',
            vm.toString(deployment.bankrollVault),
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
            '  "enterSelector": "',
            vm.toString(abi.encodePacked(MarginCallCrash.enter.selector)),
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
            '  "claimSelector": "',
            vm.toString(abi.encodePacked(MarginCallCrash.claim.selector)),
            '",\n',
            '  "settleLossSelector": "',
            vm.toString(abi.encodePacked(MarginCallCrash.settleLoss.selector)),
            '",\n',
            '  "refundSelector": "',
            vm.toString(abi.encodePacked(MarginCallCrash.refund.selector)),
            '",\n',
            '  "acceptEntrySelector": "',
            vm.toString(abi.encodePacked(BankrollVault.acceptEntry.selector)),
            '",\n',
            '  "markRoundFinalizedSelector": "',
            vm.toString(abi.encodePacked(BankrollVault.markRoundFinalized.selector)),
            '",\n',
            '  "markRoundExpiredSelector": "',
            vm.toString(abi.encodePacked(BankrollVault.markRoundExpired.selector)),
            '",\n',
            '  "payClaimSelector": "',
            vm.toString(abi.encodePacked(BankrollVault.payClaim.selector)),
            '",\n',
            '  "vaultSettleLossSelector": "',
            vm.toString(abi.encodePacked(BankrollVault.settleLoss.selector)),
            '",\n',
            '  "refundMarginSelector": "',
            vm.toString(abi.encodePacked(BankrollVault.refundMargin.selector)),
            '",\n',
            '  "setAuthorizedGameSelector": "',
            vm.toString(abi.encodePacked(BankrollVault.setAuthorizedGame.selector)),
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

    function _deploy(ExistingDeployment memory existing, uint64 epochOrigin)
        internal
        returns (Deployment memory deployment)
    {
        _validateEpochOrigin(epochOrigin);
        BankrollVault vault = BankrollVault(existing.bankrollVault);
        if (vault.authorizedGame() != address(0)) {
            revert VaultAlreadyAuthorized(vault.authorizedGame());
        }

        MarginCallCrash game = new MarginCallCrash(epochOrigin, IBankrollVault(existing.bankrollVault));
        vault.setAuthorizedGame(address(game));

        deployment = Deployment({
            chainId: block.chainid,
            deployer: existing.deployer,
            marginCallCrash: address(game),
            bankrollVault: existing.bankrollVault,
            incoLightning: address(inco),
            epochOrigin: epochOrigin,
            roundDuration: game.roundDuration(),
            entryWindow: game.entryWindow(),
            expiryDelay: game.expiryDelay()
        });

        _assertPostconditions(game, vault, deployment);
    }

    function _validateExistingDeployment(ExistingDeployment memory existing) internal view {
        if (
            existing.chainId != CHAIN_ID_BASE_SEPOLIA || existing.deployer == address(0)
                || existing.bankrollVault == address(0) || existing.bankrollVault.code.length == 0
        ) revert InvalidDeploymentRecord();
    }

    function _assertPostconditions(MarginCallCrash game, BankrollVault vault, Deployment memory deployment)
        internal
        view
    {
        if (
            deployment.chainId != CHAIN_ID_BASE_SEPOLIA || deployment.deployer == address(0)
                || deployment.marginCallCrash.code.length == 0 || deployment.incoLightning != address(inco)
                || deployment.epochOrigin % 60 != 0 || game.epochOrigin() != deployment.epochOrigin
                || address(game.vault()) != deployment.bankrollVault || vault.authorizedGame() != address(game)
                || vault.gameConfigurer() != deployment.deployer || deployment.roundDuration != 60
                || deployment.entryWindow != 45 || deployment.expiryDelay != 15 minutes
        ) revert DeploymentPostconditionFailed();
    }

    function _validateEpochOrigin(uint256 epochOrigin) internal view {
        uint256 minimumEpochOrigin = block.timestamp + MINIMUM_EPOCH_LEAD_TIME;
        if (epochOrigin > type(uint64).max || epochOrigin < minimumEpochOrigin || epochOrigin % 60 != 0) {
            revert InvalidEpochOrigin(epochOrigin, minimumEpochOrigin);
        }
    }
}
