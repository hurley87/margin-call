// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {BankrollVault} from "../src/BankrollVault.sol";
import {DeskDollars} from "../src/DeskDollars.sol";
import {DeployBankrollVault} from "../script/DeployBankrollVault.s.sol";
import {Utils} from "../script/utils/Utils.sol";

contract DeployBankrollVaultHarness is DeployBankrollVault {
    error SeedDepositorMismatch(address expected, address actual);

    function deployAndSeedForTest(ExistingDeployment memory existing, address broadcaster)
        external
        returns (Deployment memory deployment)
    {
        if (broadcaster != existing.seedDepositor) {
            revert SeedDepositorMismatch(existing.seedDepositor, broadcaster);
        }
        _validateExistingDeployment(existing);
        vm.startBroadcast(broadcaster);
        deployment = _deployAndSeed(existing);
        vm.stopBroadcast();
    }
}

contract DeployBankrollVaultTest is Test {
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84_532;
    uint256 internal constant ETHEREUM_MAINNET_CHAIN_ID = 1;
    address internal constant SEED_DEPOSITOR = address(0xB4A0B011);
    address internal constant OTHER = address(0xA11CE);

    DeskDollars internal token;
    DeployBankrollVaultHarness internal deploymentScript;

    function setUp() public {
        vm.chainId(BASE_SEPOLIA_CHAIN_ID);
        token = new DeskDollars(SEED_DEPOSITOR);
        deploymentScript = new DeployBankrollVaultHarness();
    }

    function testRunRejectsWrongChainBeforeReadingOrBroadcasting() public {
        vm.chainId(ETHEREUM_MAINNET_CHAIN_ID);

        vm.expectRevert(abi.encodeWithSelector(Utils.UnsupportedChain.selector, ETHEREUM_MAINNET_CHAIN_ID));
        deploymentScript.run();
    }

    function testRejectsWrongSeedDepositorBeforeDeployment() public {
        vm.expectRevert(
            abi.encodeWithSelector(DeployBankrollVaultHarness.SeedDepositorMismatch.selector, SEED_DEPOSITOR, OTHER)
        );
        deploymentScript.deployAndSeedForTest(_existingDeployment(), OTHER);
    }

    function testRejectsInconsistentExistingDeploymentRecordBeforeDeployment() public {
        DeployBankrollVault.ExistingDeployment memory existing = _existingDeployment();
        existing.deployer = OTHER;

        vm.expectRevert(DeployBankrollVault.InvalidDeploymentRecord.selector);
        deploymentScript.deployAndSeedForTest(existing, SEED_DEPOSITOR);
    }

    function testRejectsZeroAddressAmountAndNonBaseRecordBeforeDeployment() public {
        DeployBankrollVault.ExistingDeployment memory existing = _existingDeployment();
        existing.token = address(0);

        vm.expectRevert(DeployBankrollVault.InvalidDeploymentRecord.selector);
        deploymentScript.deployAndSeedForTest(existing, SEED_DEPOSITOR);

        existing = _existingDeployment();
        existing.seedAmount = 0;
        vm.expectRevert(DeployBankrollVault.InvalidDeploymentRecord.selector);
        deploymentScript.deployAndSeedForTest(existing, SEED_DEPOSITOR);

        existing = _existingDeployment();
        existing.chainId = 31_337;
        vm.expectRevert(DeployBankrollVault.InvalidDeploymentRecord.selector);
        deploymentScript.deployAndSeedForTest(existing, SEED_DEPOSITOR);
    }

    function testRejectsInsufficientOrUnexpectedSeedBalanceBeforeDeployment() public {
        uint256 seed = token.INITIAL_BANKROLL_SEED();
        vm.prank(SEED_DEPOSITOR);
        assertTrue(token.transfer(OTHER, 1));

        vm.expectRevert(abi.encodeWithSelector(DeployBankrollVault.SeedBalanceMismatch.selector, seed, seed - 1));
        deploymentScript.deployAndSeedForTest(_existingDeployment(), SEED_DEPOSITOR);
    }

    function testDeploysVaultAndDepositsExactSeedToSeedDepositorShares() public {
        uint256 seed = token.INITIAL_BANKROLL_SEED();

        DeployBankrollVault.Deployment memory deployment =
            deploymentScript.deployAndSeedForTest(_existingDeployment(), SEED_DEPOSITOR);
        BankrollVault vault = BankrollVault(deployment.vault);

        assertEq(deployment.chainId, BASE_SEPOLIA_CHAIN_ID);
        assertEq(deployment.token, address(token));
        assertEq(address(vault.asset()), address(token));
        assertEq(deployment.seedAssets, seed);
        assertEq(deployment.mintedShares, seed);
        assertEq(deployment.seedDepositorBalanceBefore, seed);
        assertEq(deployment.seedDepositorBalanceAfter, 0);
        assertEq(token.balanceOf(SEED_DEPOSITOR), 0);
        assertEq(token.balanceOf(address(vault)), seed);
        assertEq(vault.totalAssets(), seed);
        assertEq(vault.grossAssets(), seed);
        assertEq(vault.totalSupply(), seed);
        assertEq(vault.balanceOf(SEED_DEPOSITOR), seed);
        assertEq(token.allowance(SEED_DEPOSITOR, address(vault)), 0);
    }

    function testDeploymentRecordSerializesNonSecretConfiguration() public {
        DeployBankrollVault.Deployment memory deployment =
            deploymentScript.deployAndSeedForTest(_existingDeployment(), SEED_DEPOSITOR);

        string memory record = deploymentScript.deploymentRecord(deployment);

        assertEq(vm.parseJsonUint(record, ".chainId"), BASE_SEPOLIA_CHAIN_ID);
        assertEq(vm.parseJsonAddress(record, ".token"), address(token));
        assertEq(vm.parseJsonAddress(record, ".bankrollVault"), deployment.vault);
        assertEq(vm.parseJsonAddress(record, ".seedDepositor"), SEED_DEPOSITOR);
        assertEq(vm.parseJsonUint(record, ".seedAssets"), 25_000_000_000);
        assertEq(vm.parseJsonUint(record, ".mintedShares"), 25_000_000_000);
        assertEq(vm.parseJsonUint(record, ".seedDepositorBalanceBefore"), 25_000_000_000);
        assertEq(vm.parseJsonUint(record, ".seedDepositorBalanceAfter"), 0);
        assertEq(vm.parseJsonString(record, ".vaultDepositSelector"), "0x6e553f65");
        assertEq(
            vm.parseJsonString(record, ".verification.vault"),
            string.concat("https://sepolia.basescan.org/address/", vm.toString(deployment.vault), "#code")
        );
    }

    function _existingDeployment() internal view returns (DeployBankrollVault.ExistingDeployment memory) {
        return DeployBankrollVault.ExistingDeployment({
            chainId: BASE_SEPOLIA_CHAIN_ID,
            token: address(token),
            seedDepositor: SEED_DEPOSITOR,
            deployer: SEED_DEPOSITOR,
            seedAmount: 25_000_000_000
        });
    }
}
