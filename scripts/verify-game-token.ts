/**
 * Source-verify GameToken on Robinhood Chain testnet (Blockscout).
 *
 * Usage: pnpm verify:game-token
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

const DEFAULT_SUPPLY = "1000000000000000000000000000";

type DeploymentRecord = {
  address?: string;
  admin?: string;
  treasury?: string;
  fixedSupply?: string | number;
};

function readDeploymentRecord(): DeploymentRecord {
  const path = join(
    CONTRACTS_DIR,
    "deployments",
    "robinhood-testnet.game-token.json"
  );
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as DeploymentRecord;
}

function main() {
  const env = loadEnvLocal();
  const record = readDeploymentRecord();

  const address = requireAddress(
    env.GAMETOKEN_ADDRESS ??
      env.NEXT_PUBLIC_GAMETOKEN_ADDRESS ??
      record.address,
    "GAMETOKEN_ADDRESS"
  );
  const admin = requireAddress(
    env.GAMETOKEN_ADMIN ?? record.admin,
    "GAMETOKEN_ADMIN (constructor arg — set in env or deployment record)"
  );
  const treasury = requireAddress(
    env.GAMETOKEN_TREASURY ?? record.treasury ?? record.admin,
    "GAMETOKEN_TREASURY (constructor arg — set in env or deployment record)"
  );
  const supply = String(
    env.GAMETOKEN_SUPPLY ?? record.fixedSupply ?? DEFAULT_SUPPLY
  );

  console.log(
    `Verifying GameToken at ${address} (admin=${admin}, treasury=${treasury}, supply=${supply})…`
  );
  console.log(
    runForgeVerifyBlockscout({
      address,
      contractPath: "src/GameToken.sol:GameToken",
      constructorArgsHex: castAbiEncode(
        "constructor(address,address,uint256)",
        [admin, treasury, supply]
      ),
    })
  );
  console.log(
    `Explorer: ${ROBINHOOD_TESTNET_EXPLORER}/address/${address}#code`
  );
}

main();
