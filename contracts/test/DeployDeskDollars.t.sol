// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {DeployDeskDollars} from "../script/DeployDeskDollars.s.sol";
import {DeskDollars} from "../src/DeskDollars.sol";
import {DeskDollarsFaucet} from "../src/DeskDollarsFaucet.sol";

contract DeployDeskDollarsHarness is DeployDeskDollars {
    function deployForTest(address bankrollSeedRecipient) external returns (Deployment memory deployment) {
        _requireBaseSepolia();
        return _deploy(bankrollSeedRecipient);
    }
}

contract DeployDeskDollarsTest is Test {
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84_532;
    uint256 internal constant ETHEREUM_MAINNET_CHAIN_ID = 1;
    address internal constant BANKROLL = address(0xB4A0B011);

    DeployDeskDollarsHarness internal deploymentScript;

    function setUp() public {
        deploymentScript = new DeployDeskDollarsHarness();
    }

    function testRejectsEthereumMainnetBeforeDeployment() public {
        vm.chainId(ETHEREUM_MAINNET_CHAIN_ID);

        vm.expectRevert(abi.encodeWithSelector(DeployDeskDollars.UnsupportedChain.selector, ETHEREUM_MAINNET_CHAIN_ID));
        deploymentScript.deployForTest(BANKROLL);
    }

    function testRunRejectsEthereumMainnetBeforeBroadcast() public {
        vm.chainId(ETHEREUM_MAINNET_CHAIN_ID);

        vm.expectRevert(abi.encodeWithSelector(DeployDeskDollars.UnsupportedChain.selector, ETHEREUM_MAINNET_CHAIN_ID));
        deploymentScript.run(BANKROLL);
    }

    function testRejectsAnyNonBaseSepoliaChainBeforeDeployment() public {
        vm.chainId(31_337);

        vm.expectRevert(abi.encodeWithSelector(DeployDeskDollars.UnsupportedChain.selector, 31_337));
        deploymentScript.deployForTest(BANKROLL);
    }

    function testDeploysDeskDollarsAndFaucetOnBaseSepolia() public {
        vm.chainId(BASE_SEPOLIA_CHAIN_ID);

        DeployDeskDollars.Deployment memory deployment = deploymentScript.deployForTest(BANKROLL);
        DeskDollars token = DeskDollars(deployment.token);
        DeskDollarsFaucet faucet = DeskDollarsFaucet(deployment.faucet);

        assertEq(deployment.chainId, BASE_SEPOLIA_CHAIN_ID);
        assertEq(deployment.bankrollSeedRecipient, BANKROLL);
        assertEq(deployment.deployer, address(deploymentScript));
        assertEq(deployment.bankrollSeedAmount, 25_000_000_000);
        assertEq(token.balanceOf(BANKROLL), deployment.bankrollSeedAmount);
        assertEq(token.totalSupply(), deployment.bankrollSeedAmount);
        assertEq(token.faucet(), address(faucet));
        assertEq(address(faucet.deskDollars()), address(token));
        assertTrue(deployment.faucetConfigured);
    }

    function testDeployerHasNoRemainingMintRouteAfterFaucetHandoff() public {
        vm.chainId(BASE_SEPOLIA_CHAIN_ID);

        DeployDeskDollars.Deployment memory deployment = deploymentScript.deployForTest(BANKROLL);
        DeskDollars token = DeskDollars(deployment.token);

        vm.expectRevert(abi.encodeWithSelector(DeskDollars.NotFaucet.selector, address(deploymentScript)));
        vm.prank(address(deploymentScript));
        token.mintFromFaucet(BANKROLL, 1);
    }

    function testDeploymentRecordSerializesNonSecretDeploymentConfiguration() public {
        vm.chainId(BASE_SEPOLIA_CHAIN_ID);

        DeployDeskDollars.Deployment memory deployment = deploymentScript.deployForTest(BANKROLL);
        string memory record = deploymentScript.deploymentRecord(deployment);

        assertEq(
            record,
            string.concat(
                "{\n",
                '  "chainId": 84532,\n',
                '  "token": "',
                vm.toString(deployment.token),
                '",\n',
                '  "faucet": "',
                vm.toString(deployment.faucet),
                '",\n',
                '  "bankrollSeedRecipient": "',
                vm.toString(BANKROLL),
                '",\n',
                '  "deployer": "',
                vm.toString(address(deploymentScript)),
                '",\n',
                '  "bankrollSeedAmount": 25000000000,\n',
                '  "faucetClaimAmount": 100000000,\n',
                '  "faucetClaimCooldown": 3600,\n',
                '  "faucetConfigured": true\n',
                "}\n"
            )
        );
    }
}
