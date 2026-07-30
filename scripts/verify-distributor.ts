/**
 * Source-verify Distributor on Robinhood Chain testnet (Blockscout).
 *
 * Usage: pnpm verify:distributor
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  castAbiEncode,
  CONTRACTS_DIR,
  loadEnvLocal,
  requireAddress,
  ROBINHOOD_TESTNET_EXPLORER,
  runForgeVerifyBlockscout,
} from "./deploy-utils";

type DeploymentRecord = {
  address?: string;
  admin?: string;
  gameToken?: string;
};

function readDeploymentRecord(): DeploymentRecord {
  const path = join(
    CONTRACTS_DIR,
    "deployments",
    "robinhood-testnet.distributor.json"
  );
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as DeploymentRecord;
}

function main() {
  const env = loadEnvLocal();
  const record = readDeploymentRecord();

  const address = requireAddress(
    env.DISTRIBUTOR_ADDRESS ??
      env.NEXT_PUBLIC_DISTRIBUTOR_ADDRESS ??
      record.address,
    "DISTRIBUTOR_ADDRESS"
  );
  const admin = requireAddress(
    env.DISTRIBUTOR_ADMIN ?? record.admin,
    "DISTRIBUTOR_ADMIN (constructor arg — set in env or deployment record)"
  );
  const gameToken = requireAddress(
    env.GAMETOKEN_ADDRESS ?? record.gameToken,
    "GAMETOKEN_ADDRESS"
  );

  console.log(
    `Verifying Distributor at ${address} (admin=${admin}, gameToken=${gameToken})…`
  );
  console.log(
    runForgeVerifyBlockscout({
      address,
      contractPath: "src/Distributor.sol:Distributor",
      constructorArgsHex: castAbiEncode("constructor(address,address)", [
        admin,
        gameToken,
      ]),
    })
  );
  console.log(
    `Explorer: ${ROBINHOOD_TESTNET_EXPLORER}/address/${address}#code`
  );
}

main();
