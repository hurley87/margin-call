// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";

/// @notice LazerForge-style helpers for reading and writing deployment records.
contract Utils is Script {
    error UnsupportedChain(uint256 chainId);

    uint256 constant CHAIN_ID_ANVIL_LOCALNET = 31_337;
    uint256 constant CHAIN_ID_BASE_SEPOLIA = 84_532;

    string constant OUTPUT_ANVIL_LOCALNET = "anvil_localnet";
    // Curated, hand-maintained release record (checked in). Scripts must never
    // write here directly — they write the *.run record for deliberate merging.
    string constant OUTPUT_BASE_SEPOLIA = "base_sepolia";
    string constant OUTPUT_BASE_SEPOLIA_RUN = "base_sepolia.run";
    // Each deploy script writes its own run record so one workflow's output
    // never clobbers another's before it is merged into the curated record.
    string constant OUTPUT_BASE_SEPOLIA_VAULT_RUN = "base_sepolia.bankroll_vault.run";
    string constant OUTPUT_UNKNOWN = "unknown";

    function _requireBaseSepolia() internal view {
        if (block.chainid != CHAIN_ID_BASE_SEPOLIA) revert UnsupportedChain(block.chainid);
    }

    function readInput(string memory inputFileName) internal view returns (string memory) {
        string memory file = getInputPath(inputFileName);
        return vm.readFile(file);
    }

    function getInputPath(string memory inputFileName) internal view returns (string memory) {
        string memory inputDir = string.concat(vm.projectRoot(), "/deployments/");
        string memory file = string.concat(inputFileName, ".json");
        return string.concat(inputDir, file);
    }

    function readOutput(string memory outputFileName) internal view returns (string memory) {
        string memory file = getOutputPath(outputFileName);
        return vm.readFile(file);
    }

    function writeOutput(string memory outputJson, string memory outputFileName) internal {
        string memory outputFilePath = getOutputPath(outputFileName);
        vm.writeJson(outputJson, outputFilePath);
    }

    function getOutputPath(string memory outputFileName) internal view returns (string memory) {
        string memory outputDir = string.concat(vm.projectRoot(), "/deployments/");
        string memory outputFilePath = string.concat(outputDir, outputFileName, ".json");
        return outputFilePath;
    }
}
