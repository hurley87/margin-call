// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import {Test} from "forge-std/Test.sol";

import {inco} from "@inco/lightning/src/Lib.sol";
import {DeployMarginCallCrash} from "../script/DeployMarginCallCrash.s.sol";
import {BankrollVault} from "../src/BankrollVault.sol";
import {DeskDollars} from "../src/DeskDollars.sol";
import {MarginCallCrash} from "../src/MarginCallCrash.sol";
import {Utils} from "../script/utils/Utils.sol";

contract DeployMarginCallCrashHarness is DeployMarginCallCrash {
    error DeployerMismatch(address expected, address actual);

    function deployForTest(ExistingDeployment memory existing, address broadcaster, uint64 epochOrigin)
        external
        returns (Deployment memory deployment)
    {
        if (broadcaster != existing.deployer) revert DeployerMismatch(existing.deployer, broadcaster);
        _validateExistingDeployment(existing);
        _validateEpochOrigin(epochOrigin);
        vm.startBroadcast(broadcaster);
        deployment = _deploy(existing, epochOrigin);
        vm.stopBroadcast();
    }
}

contract DeployMarginCallCrashTest is Test {
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84_532;
    uint256 internal constant ETHEREUM_MAINNET_CHAIN_ID = 1;
    address internal constant DEPLOYER = address(0xD3F10);
    address internal constant OTHER = address(0xA11CE);
    uint64 internal constant EPOCH_ORIGIN = 1_000_380;

    DeployMarginCallCrashHarness internal deploymentScript;
    DeskDollars internal token;
    BankrollVault internal vault;

    function setUp() public {
        vm.chainId(BASE_SEPOLIA_CHAIN_ID);
        vm.warp(1_000_037);

        // Mirror production: deployer configures the vault, then authorizes the game.
        vm.prank(DEPLOYER);
        token = new DeskDollars(DEPLOYER);
        vm.prank(DEPLOYER);
        vault = new BankrollVault(token);

        deploymentScript = new DeployMarginCallCrashHarness();
    }

    function testDeploysCrashGameOnMinuteAlignedEpochAndAuthorizesVault() public {
        DeployMarginCallCrash.Deployment memory deployment =
            deploymentScript.deployForTest(_existingDeployment(), DEPLOYER, EPOCH_ORIGIN);
        MarginCallCrash game = MarginCallCrash(deployment.marginCallCrash);

        assertEq(deployment.chainId, BASE_SEPOLIA_CHAIN_ID);
        assertEq(deployment.deployer, DEPLOYER);
        assertEq(deployment.bankrollVault, address(vault));
        assertEq(deployment.epochOrigin, EPOCH_ORIGIN);
        assertEq(deployment.incoLightning, address(inco));
        assertEq(game.epochOrigin(), deployment.epochOrigin);
        assertEq(address(game.vault()), address(vault));
        assertEq(vault.authorizedGame(), address(game));
        assertEq(game.roundDuration(), 60);
        assertEq(game.entryWindow(), 45);
        assertEq(game.expiryDelay(), 15 minutes);

        vm.warp(EPOCH_ORIGIN);
        assertEq(game.currentRoundId(), 0);
    }

    function testRunRejectsWrongChainBeforeReadingOrBroadcasting() public {
        vm.chainId(ETHEREUM_MAINNET_CHAIN_ID);

        vm.expectRevert(abi.encodeWithSelector(Utils.UnsupportedChain.selector, ETHEREUM_MAINNET_CHAIN_ID));
        deploymentScript.run();
    }

    function testRejectsWrongBroadcasterBeforeDeployment() public {
        vm.expectRevert(abi.encodeWithSelector(DeployMarginCallCrashHarness.DeployerMismatch.selector, DEPLOYER, OTHER));
        deploymentScript.deployForTest(_existingDeployment(), OTHER, EPOCH_ORIGIN);
    }

    function testRejectsInvalidExistingDeploymentRecord() public {
        DeployMarginCallCrash.ExistingDeployment memory existing = _existingDeployment();
        existing.chainId = ETHEREUM_MAINNET_CHAIN_ID;

        vm.expectRevert(DeployMarginCallCrash.InvalidDeploymentRecord.selector);
        deploymentScript.deployForTest(existing, DEPLOYER, EPOCH_ORIGIN);

        existing = _existingDeployment();
        existing.deployer = address(0);
        vm.expectRevert(DeployMarginCallCrash.InvalidDeploymentRecord.selector);
        deploymentScript.deployForTest(existing, address(0), EPOCH_ORIGIN);

        existing = _existingDeployment();
        existing.bankrollVault = address(0);
        vm.expectRevert(DeployMarginCallCrash.InvalidDeploymentRecord.selector);
        deploymentScript.deployForTest(existing, DEPLOYER, EPOCH_ORIGIN);
    }

    function testRejectsEpochWithoutLeadTimeOrMinuteAlignment() public {
        uint256 minimumEpochOrigin = block.timestamp + 5 minutes;
        uint64 tooSoon = 1_000_320;

        vm.expectRevert(
            abi.encodeWithSelector(DeployMarginCallCrash.InvalidEpochOrigin.selector, tooSoon, minimumEpochOrigin)
        );
        deploymentScript.deployForTest(_existingDeployment(), DEPLOYER, tooSoon);

        uint64 misaligned = EPOCH_ORIGIN + 1;
        vm.expectRevert(
            abi.encodeWithSelector(DeployMarginCallCrash.InvalidEpochOrigin.selector, misaligned, minimumEpochOrigin)
        );
        deploymentScript.deployForTest(_existingDeployment(), DEPLOYER, misaligned);
    }

    function testReadsValidatedEpochOriginFromEnvironment() public {
        vm.setEnv("MARGIN_CALL_EPOCH_ORIGIN", vm.toString(EPOCH_ORIGIN));

        assertEq(deploymentScript.configuredEpochOrigin(), EPOCH_ORIGIN);
    }

    function testDeploymentRecordSerializesNonSecretConfiguration() public {
        DeployMarginCallCrash.Deployment memory deployment =
            deploymentScript.deployForTest(_existingDeployment(), DEPLOYER, EPOCH_ORIGIN);

        string memory record = deploymentScript.deploymentRecord(deployment);

        assertEq(vm.parseJsonUint(record, ".chainId"), BASE_SEPOLIA_CHAIN_ID);
        assertEq(vm.parseJsonAddress(record, ".deployer"), DEPLOYER);
        assertEq(vm.parseJsonAddress(record, ".marginCallCrash"), deployment.marginCallCrash);
        assertEq(vm.parseJsonAddress(record, ".bankrollVault"), address(vault));
        assertEq(vm.parseJsonAddress(record, ".incoLightning"), address(inco));
        assertEq(vm.parseJsonString(record, ".incoPackageVersion"), "1.0.2");
        assertEq(vm.parseJsonUint(record, ".epochOrigin"), EPOCH_ORIGIN);
        assertEq(vm.parseJsonUint(record, ".roundDuration"), 60);
        assertEq(vm.parseJsonUint(record, ".entryWindow"), 45);
        assertEq(vm.parseJsonUint(record, ".expiryDelay"), 15 minutes);
        assertEq(
            vm.parseJsonString(record, ".openRoundSelector"),
            vm.toString(abi.encodePacked(MarginCallCrash.openRound.selector))
        );
        assertEq(
            vm.parseJsonString(record, ".enterSelector"), vm.toString(abi.encodePacked(MarginCallCrash.enter.selector))
        );
        assertEq(
            vm.parseJsonString(record, ".requestRevealSelector"),
            vm.toString(abi.encodePacked(MarginCallCrash.requestReveal.selector))
        );
        assertEq(
            vm.parseJsonString(record, ".finalizeRoundSelector"),
            vm.toString(abi.encodePacked(MarginCallCrash.finalizeRound.selector))
        );
        assertEq(
            vm.parseJsonString(record, ".expireRoundSelector"),
            vm.toString(abi.encodePacked(MarginCallCrash.expireRound.selector))
        );
        assertEq(
            vm.parseJsonString(record, ".acceptEntrySelector"),
            vm.toString(abi.encodePacked(BankrollVault.acceptEntry.selector))
        );
        assertEq(
            vm.parseJsonString(record, ".setAuthorizedGameSelector"),
            vm.toString(abi.encodePacked(BankrollVault.setAuthorizedGame.selector))
        );
        assertEq(
            vm.parseJsonString(record, ".verification.marginCallCrash"),
            string.concat("https://sepolia.basescan.org/address/", vm.toString(deployment.marginCallCrash), "#code")
        );
    }

    function _existingDeployment() internal view returns (DeployMarginCallCrash.ExistingDeployment memory) {
        return DeployMarginCallCrash.ExistingDeployment({
            chainId: BASE_SEPOLIA_CHAIN_ID, deployer: DEPLOYER, bankrollVault: address(vault)
        });
    }
}
