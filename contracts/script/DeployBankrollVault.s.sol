// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BankrollVault} from "../src/BankrollVault.sol";
import {DeskDollars} from "../src/DeskDollars.sol";
import {Utils} from "./utils/Utils.sol";

/// @notice Deploys the Base Sepolia BankrollVault and moves the existing tUSD seed into it.
/// @dev The curated deployment record is input only. A successful run writes the gitignored
///      `deployments/base_sepolia.run.json` record for deliberate human merging.
///      Invoke with the recorded seed depositor as the Forge sender:
///      forge script script/DeployBankrollVault.s.sol:DeployBankrollVault --rpc-url <base-sepolia-rpc> \
///        --sender 0xBe523e724B9Ea7D618dD093f14618D90c4B19b0c --broadcast
contract DeployBankrollVault is Utils {
    error UnsupportedChain(uint256 chainId);
    error InvalidDeploymentRecord();
    error SeedDepositorMismatch(address expected, address actual);
    error SeedBalanceMismatch(uint256 expected, uint256 actual);
    error DeploymentPostconditionFailed();

    string internal constant OUTPUT_NAME = OUTPUT_BASE_SEPOLIA_RUN;
    string internal constant BASESCAN_ADDRESS_PREFIX = "https://sepolia.basescan.org/address/";
    string internal constant BASESCAN_CODE_SUFFIX = "#code";
    string internal constant DEPOSIT_SELECTOR = "0x6e553f65";

    struct ExistingDeployment {
        uint256 chainId;
        address token;
        address seedDepositor;
        address deployer;
        uint256 seedAmount;
    }

    struct Deployment {
        uint256 chainId;
        address token;
        address vault;
        address seedDepositor;
        uint256 seedAssets;
        uint256 mintedShares;
        uint256 seedDepositorBalanceBefore;
        uint256 seedDepositorBalanceAfter;
    }

    /// @notice Broadcasts the vault deployment and exact initial LP deposit from the recorded depositor.
    function run() external returns (Deployment memory deployment) {
        _requireBaseSepolia();
        ExistingDeployment memory existing = existingDeployment();
        _validateExistingDeployment(existing);

        // The exact recorded seed depositor is the only broadcaster permitted for this workflow.
        // Forge will refuse a live broadcast unless its configured signer can sign for this address.
        vm.startBroadcast(existing.seedDepositor);
        deployment = _deployAndSeed(existing);
        vm.stopBroadcast();

        writeOutput(deploymentRecord(deployment), OUTPUT_NAME);
    }

    /// @notice Reads only the non-secret curated Base Sepolia release record.
    function existingDeployment() public view returns (ExistingDeployment memory existing) {
        string memory record = readInput(OUTPUT_BASE_SEPOLIA);
        existing = ExistingDeployment({
            chainId: vm.parseJsonUint(record, ".chainId"),
            token: vm.parseJsonAddress(record, ".token"),
            seedDepositor: vm.parseJsonAddress(record, ".bankrollSeedRecipient"),
            deployer: vm.parseJsonAddress(record, ".deployer"),
            seedAmount: vm.parseJsonUint(record, ".bankrollSeedAmount")
        });
    }

    /// @notice Returns the non-secret provenance record written after a successful run.
    function deploymentRecord(Deployment memory deployment) public pure returns (string memory) {
        return string.concat(
            "{\n",
            '  "chainId": ',
            vm.toString(deployment.chainId),
            ",\n",
            '  "token": "',
            vm.toString(deployment.token),
            '",\n',
            '  "bankrollVault": "',
            vm.toString(deployment.vault),
            '",\n',
            '  "seedDepositor": "',
            vm.toString(deployment.seedDepositor),
            '",\n',
            '  "seedAssets": ',
            vm.toString(deployment.seedAssets),
            ",\n",
            '  "mintedShares": ',
            vm.toString(deployment.mintedShares),
            ",\n",
            '  "seedDepositorBalanceBefore": ',
            vm.toString(deployment.seedDepositorBalanceBefore),
            ",\n",
            '  "seedDepositorBalanceAfter": ',
            vm.toString(deployment.seedDepositorBalanceAfter),
            ",\n",
            '  "vaultDepositSelector": "',
            DEPOSIT_SELECTOR,
            '",\n',
            '  "verification": {\n',
            '    "vault": "',
            BASESCAN_ADDRESS_PREFIX,
            vm.toString(deployment.vault),
            BASESCAN_CODE_SUFFIX,
            '"\n',
            "  }\n",
            "}\n"
        );
    }

    function _deployAndSeed(ExistingDeployment memory existing) internal returns (Deployment memory deployment) {
        _validateExistingDeployment(existing);

        IERC20 token = IERC20(existing.token);
        uint256 balanceBefore = token.balanceOf(existing.seedDepositor);
        // The initial mint is the only accepted source for this seed. Any changed balance requires
        // deliberate release-record review rather than silently depositing a different amount.
        if (balanceBefore != existing.seedAmount) {
            revert SeedBalanceMismatch(existing.seedAmount, balanceBefore);
        }

        BankrollVault vault = new BankrollVault(token);
        token.approve(address(vault), existing.seedAmount);
        uint256 mintedShares = vault.deposit(existing.seedAmount, existing.seedDepositor);

        deployment = Deployment({
            chainId: block.chainid,
            token: existing.token,
            vault: address(vault),
            seedDepositor: existing.seedDepositor,
            seedAssets: existing.seedAmount,
            mintedShares: mintedShares,
            seedDepositorBalanceBefore: balanceBefore,
            seedDepositorBalanceAfter: token.balanceOf(existing.seedDepositor)
        });

        _assertPostconditions(token, vault, deployment);
    }

    function _requireBaseSepolia() internal view {
        if (block.chainid != CHAIN_ID_BASE_SEPOLIA) revert UnsupportedChain(block.chainid);
    }

    function _validateExistingDeployment(ExistingDeployment memory existing) internal view {
        if (
            existing.chainId != CHAIN_ID_BASE_SEPOLIA || existing.token == address(0)
                || existing.seedDepositor == address(0) || existing.deployer != existing.seedDepositor
                || existing.seedAmount == 0 || existing.token.code.length == 0
        ) revert InvalidDeploymentRecord();

        try DeskDollars(existing.token).INITIAL_BANKROLL_SEED() returns (uint256 initialSeed) {
            if (initialSeed != existing.seedAmount) revert InvalidDeploymentRecord();
        } catch {
            revert InvalidDeploymentRecord();
        }
    }

    function _assertPostconditions(IERC20 token, BankrollVault vault, Deployment memory deployment) internal view {
        if (
            deployment.chainId != CHAIN_ID_BASE_SEPOLIA || address(vault.asset()) != deployment.token
                || vault.grossAssets() != deployment.seedAssets || vault.totalAssets() != deployment.seedAssets
                || vault.totalSupply() != deployment.mintedShares
                || vault.balanceOf(deployment.seedDepositor) != deployment.mintedShares
                || deployment.mintedShares != deployment.seedAssets
                || deployment.seedDepositorBalanceBefore != deployment.seedAssets
                || deployment.seedDepositorBalanceAfter != 0 || token.balanceOf(address(vault)) != deployment.seedAssets
                || token.allowance(deployment.seedDepositor, address(vault)) != 0
        ) revert DeploymentPostconditionFailed();
    }
}
