// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {DeskDollars} from "../src/DeskDollars.sol";
import {DeskDollarsFaucet} from "../src/DeskDollarsFaucet.sol";
import {Utils} from "./utils/Utils.sol";

/// @notice Deploys the testnet-only Desk Dollars token and its public faucet.
/// @dev Run only with an explicitly supplied bankroll recipient:
///      forge script script/DeployDeskDollars.s.sol:DeployDeskDollars --sig "run(address)" <recipient> --broadcast
contract DeployDeskDollars is Utils {
    error UnsupportedChain(uint256 chainId);
    error DeploymentPostconditionFailed();

    string internal constant OUTPUT_NAME = OUTPUT_BASE_SEPOLIA_RUN;

    struct Deployment {
        uint256 chainId;
        address token;
        address faucet;
        address bankrollSeedRecipient;
        address deployer;
        uint256 bankrollSeedAmount;
        uint256 faucetClaimAmount;
        uint256 faucetClaimCooldown;
        bool faucetConfigured;
    }

    /// @notice Broadcasts the Base Sepolia deployment and writes its non-secret run record to
    ///         deployments/base_sepolia.run.json (gitignored); merge it into the curated
    ///         deployments/base_sepolia.json by hand so re-runs never clobber release provenance.
    function run(address bankrollSeedRecipient) external returns (Deployment memory deployment) {
        _requireBaseSepolia();

        vm.startBroadcast();
        deployment = _deploy(bankrollSeedRecipient);
        vm.stopBroadcast();

        writeOutput(deploymentRecord(deployment), OUTPUT_NAME);
    }

    /// @notice Returns the JSON record written after a successful deployment.
    function deploymentRecord(Deployment memory deployment) public pure returns (string memory) {
        return string.concat(
            "{\n",
            '  "chainId": ',
            vm.toString(deployment.chainId),
            ",\n",
            '  "token": "',
            vm.toString(deployment.token),
            '",\n',
            '  "faucet": "',
            vm.toString(deployment.faucet),
            '",\n',
            '  "bankrollSeedRecipient": "',
            vm.toString(deployment.bankrollSeedRecipient),
            '",\n',
            '  "deployer": "',
            vm.toString(deployment.deployer),
            '",\n',
            '  "bankrollSeedAmount": ',
            vm.toString(deployment.bankrollSeedAmount),
            ",\n",
            '  "faucetClaimAmount": ',
            vm.toString(deployment.faucetClaimAmount),
            ",\n",
            '  "faucetClaimCooldown": ',
            vm.toString(deployment.faucetClaimCooldown),
            ",\n",
            '  "faucetConfigured": ',
            vm.toString(deployment.faucetConfigured),
            "\n",
            "}\n"
        );
    }

    function _deploy(address bankrollSeedRecipient) internal returns (Deployment memory deployment) {
        DeskDollars token = new DeskDollars(bankrollSeedRecipient);
        DeskDollarsFaucet faucet = new DeskDollarsFaucet(token);
        token.configureFaucet(address(faucet));

        deployment = Deployment({
            chainId: block.chainid,
            token: address(token),
            faucet: address(faucet),
            bankrollSeedRecipient: bankrollSeedRecipient,
            deployer: token.faucetConfigurer(),
            bankrollSeedAmount: token.INITIAL_BANKROLL_SEED(),
            faucetClaimAmount: faucet.CLAIM_AMOUNT(),
            faucetClaimCooldown: faucet.CLAIM_COOLDOWN(),
            faucetConfigured: token.faucet() == address(faucet)
        });

        _assertPostconditions(token, faucet, deployment);
    }

    function _requireBaseSepolia() internal view {
        if (block.chainid != CHAIN_ID_BASE_SEPOLIA) revert UnsupportedChain(block.chainid);
    }

    function _assertPostconditions(DeskDollars token, DeskDollarsFaucet faucet, Deployment memory deployment)
        internal
        view
    {
        if (
            deployment.chainId != CHAIN_ID_BASE_SEPOLIA || deployment.deployer == address(0)
                || token.balanceOf(deployment.bankrollSeedRecipient) != deployment.bankrollSeedAmount
                || token.totalSupply() != deployment.bankrollSeedAmount || token.faucet() != deployment.faucet
                || address(faucet.deskDollars()) != deployment.token || !deployment.faucetConfigured
        ) revert DeploymentPostconditionFailed();
    }
}
