// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console2} from "forge-std/console2.sol";
import {GameToken} from "../src/GameToken.sol";
import {Utils} from "./utils/Utils.sol";

/// @notice Deploy GameToken, minting the entire fixed supply to the treasury.
/// @dev Signing: set DEPLOYER_PRIVATE_KEY. Env:
///        GAMETOKEN_ADMIN     — optional; defaults to deployer
///        GAMETOKEN_TREASURY  — optional; defaults to deployer (receives the whole supply)
///        GAMETOKEN_SUPPLY    — optional; 18-decimal units, default 1_000_000_000e18
///      There is no mint authority after deploy, so the supply chosen here is final. The transfer
///      lock ships engaged: grant `DISTRIBUTOR_ROLE` to the Distributor (see DeployDistributor)
///      before funding it, otherwise the funding transfer fails closed.
contract DeployGameToken is Utils {
    uint256 internal constant ROBINHOOD_TESTNET_CHAIN_ID = 46_630;
    uint256 internal constant DEFAULT_SUPPLY = 1_000_000_000e18;

    /// @dev One whole token. Anything smaller is almost certainly a token count typed as if it
    ///      were wei, and with no mint authority that mistake is only fixable by redeploying.
    uint256 internal constant MIN_SUPPLY = 1e18;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address admin = vm.envOr("GAMETOKEN_ADMIN", deployer);
        address treasury = vm.envOr("GAMETOKEN_TREASURY", deployer);
        uint256 supply = vm.envOr("GAMETOKEN_SUPPLY", DEFAULT_SUPPLY);
        require(supply >= MIN_SUPPLY, "DeployGameToken: GAMETOKEN_SUPPLY is in 18-decimal units, not whole tokens");

        vm.startBroadcast(deployerKey);
        GameToken token = new GameToken(admin, treasury, supply);
        vm.stopBroadcast();

        console2.log("GameToken deployed at:", address(token));
        console2.log("Admin:", admin);
        console2.log("Treasury:", treasury);
        console2.log("Fixed supply:", supply);
        console2.log("Transfer-enable delay (seconds):", token.TRANSFER_ENABLE_DELAY());

        _writeRecord(address(token), deployer, admin, treasury, supply, token.TRANSFER_ENABLE_DELAY());
    }

    function _writeRecord(
        address token,
        address deployer,
        address admin,
        address treasury,
        uint256 supply,
        uint256 transferEnableDelay
    ) internal {
        string memory obj = "gametoken";
        vm.serializeUint(obj, "version", 1);
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "address", token);
        vm.serializeAddress(obj, "deployer", deployer);
        vm.serializeAddress(obj, "admin", admin);
        vm.serializeAddress(obj, "treasury", treasury);
        vm.serializeUint(obj, "fixedSupply", supply);
        vm.serializeUint(obj, "transferEnableDelay", transferEnableDelay);
        vm.serializeBool(obj, "transfersEnabled", false);
        vm.serializeUint(obj, "blockNumber", block.number);
        vm.serializeUint(obj, "timestamp", block.timestamp);
        vm.serializeString(obj, "solc", "0.8.28");
        vm.serializeString(obj, "evmVersion", "cancun");
        vm.serializeUint(obj, "optimizerRuns", 1_000_000);
        vm.serializeString(obj, "bytecodeHash", "none");
        string memory finalJson = vm.serializeBool(obj, "cborMetadata", false);

        string memory fileName = block.chainid == ROBINHOOD_TESTNET_CHAIN_ID
            ? "robinhood-testnet.game-token"
            : string.concat("chain-", vm.toString(block.chainid), ".game-token");

        writeOutput(finalJson, fileName);
        console2.log("Wrote deployment record:", getOutputPath(fileName));
    }
}
