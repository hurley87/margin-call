// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {console2} from "forge-std/console2.sol";
import {Distributor} from "../src/Distributor.sol";
import {GameToken} from "../src/GameToken.sol";
import {Utils} from "./utils/Utils.sol";

/// @notice Deploy Distributor, exempt it from the GameToken transfer lock, and optionally fund it.
/// @dev Signing: set DEPLOYER_PRIVATE_KEY. Env:
///        GAMETOKEN_ADDRESS / DISTRIBUTOR_GAME_TOKEN — required GameToken
///        DISTRIBUTOR_ADMIN       — optional; defaults to deployer
///        DISTRIBUTOR_GRANT_ROLE  — optional; "true" (default) grants GameToken DISTRIBUTOR_ROLE
///                                  when the deployer is the token admin
///        DISTRIBUTOR_FUND        — optional; 18-decimal units transferred from the deployer's
///                                  balance after the role is granted (funding is a plain transfer;
///                                  the deployer must be the GameToken treasury, since that is the
///                                  only sender the transfer lock lets fund a role holder)
///        DISTRIBUTOR_MAKER_RATE  — optional; `makerRatePerEpoch`, set when admin == deployer
///        DISTRIBUTOR_TAKER_POT   — optional; `takerPotPerEpoch`, set when admin == deployer
contract DeployDistributor is Utils {
    uint256 internal constant ROBINHOOD_TESTNET_CHAIN_ID = 46_630;

    /// @dev Mirrors `Distributor` deploy inputs and the post-deploy wiring actually performed.
    struct Record {
        address distributor;
        address gameToken;
        address deployer;
        address admin;
        bool grantedRole;
        uint256 funded;
        uint256 makerRate;
        uint256 takerPot;
    }

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address admin = vm.envOr("DISTRIBUTOR_ADMIN", deployer);

        address gameToken = vm.envOr("DISTRIBUTOR_GAME_TOKEN", address(0));
        if (gameToken == address(0)) {
            gameToken = vm.envAddress("GAMETOKEN_ADDRESS");
        }

        bool grantRole = vm.envOr("DISTRIBUTOR_GRANT_ROLE", true);
        uint256 fund = vm.envOr("DISTRIBUTOR_FUND", uint256(0));
        uint256 makerRate = vm.envOr("DISTRIBUTOR_MAKER_RATE", uint256(0));
        uint256 takerPot = vm.envOr("DISTRIBUTOR_TAKER_POT", uint256(0));

        vm.startBroadcast(deployerKey);
        Distributor distributor = new Distributor(admin, gameToken);

        if (grantRole) {
            require(
                GameToken(gameToken).hasRole(bytes32(0), deployer),
                "DeployDistributor: deployer must hold GameToken DEFAULT_ADMIN_ROLE to grant DISTRIBUTOR_ROLE"
            );
            GameToken(gameToken).grantRole(keccak256("DISTRIBUTOR_ROLE"), address(distributor));
        }

        if (fund != 0) {
            require(grantRole, "DeployDistributor: grant DISTRIBUTOR_ROLE before funding or the transfer fails closed");
            require(
                GameToken(gameToken).treasury() == deployer,
                "DeployDistributor: only the GameToken treasury may fund while transfers are locked"
            );
            require(
                GameToken(gameToken).balanceOf(deployer) >= fund,
                "DeployDistributor: deployer balance below DISTRIBUTOR_FUND"
            );
            require(
                GameToken(gameToken).transfer(address(distributor), fund), "DeployDistributor: funding transfer failed"
            );
        }

        if (makerRate != 0 || takerPot != 0) {
            require(admin == deployer, "DeployDistributor: deployer must be admin to set epoch rates");
            if (makerRate != 0) distributor.setMakerRatePerEpoch(makerRate);
            if (takerPot != 0) distributor.setTakerPotPerEpoch(takerPot);
        }
        vm.stopBroadcast();

        console2.log("Distributor deployed at:", address(distributor));
        console2.log("GameToken:", gameToken);
        console2.log("Admin:", admin);
        console2.log("Granted DISTRIBUTOR_ROLE:", grantRole);
        console2.log("Funded balance:", distributor.fundedBalance());
        console2.log("makerRatePerEpoch:", distributor.makerRatePerEpoch());
        console2.log("takerPotPerEpoch:", distributor.takerPotPerEpoch());
        console2.log("rebatePerRipCap:", distributor.rebatePerRipCap());

        _writeRecord(
            Record({
                distributor: address(distributor),
                gameToken: gameToken,
                deployer: deployer,
                admin: admin,
                grantedRole: grantRole,
                funded: distributor.fundedBalance(),
                makerRate: distributor.makerRatePerEpoch(),
                takerPot: distributor.takerPotPerEpoch()
            })
        );
    }

    function _writeRecord(Record memory record) internal {
        string memory obj = "distributor";
        vm.serializeUint(obj, "version", 1);
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "address", record.distributor);
        vm.serializeAddress(obj, "gameToken", record.gameToken);
        vm.serializeAddress(obj, "deployer", record.deployer);
        vm.serializeAddress(obj, "admin", record.admin);
        vm.serializeBool(obj, "grantedDistributorRole", record.grantedRole);
        vm.serializeUint(obj, "fundedBalance", record.funded);
        vm.serializeUint(obj, "makerRatePerEpoch", record.makerRate);
        vm.serializeUint(obj, "takerPotPerEpoch", record.takerPot);
        vm.serializeUint(obj, "epochDuration", 1 days);
        vm.serializeUint(obj, "blockNumber", block.number);
        vm.serializeUint(obj, "timestamp", block.timestamp);
        vm.serializeString(obj, "solc", "0.8.28");
        vm.serializeString(obj, "evmVersion", "cancun");
        vm.serializeUint(obj, "optimizerRuns", 1_000_000);
        vm.serializeString(obj, "bytecodeHash", "none");
        string memory finalJson = vm.serializeBool(obj, "cborMetadata", false);

        string memory fileName = block.chainid == ROBINHOOD_TESTNET_CHAIN_ID
            ? "robinhood-testnet.distributor"
            : string.concat("chain-", vm.toString(block.chainid), ".distributor");

        writeOutput(finalJson, fileName);
        console2.log("Wrote deployment record:", getOutputPath(fileName));
    }
}
