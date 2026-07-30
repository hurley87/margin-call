/**
 * Source-verify RipEngine + MockRandomness on Robinhood Chain testnet (Blockscout).
 *
 * Usage: pnpm verify:rip-engine
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

/** Default MockRandomness seed from DeployRipEngine (`RIPENGINE_SEED` or 0xC0FFEE). */
const DEFAULT_SEED = "12648430"; // 0xC0FFEE

type DeploymentRecord = {
  address?: string;
  admin?: string;
  randomness?: string;
  packs?: string;
  registry?: string;
  stablecoin?: string;
};

function readDeploymentRecord(): DeploymentRecord {
  const path = join(
    CONTRACTS_DIR,
    "deployments",
    "robinhood-testnet.rip-engine.json"
  );
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as DeploymentRecord;
}

function main() {
  const env = loadEnvLocal();
  const record = readDeploymentRecord();

  const engine = requireAddress(
    env.RIPENGINE_ADDRESS ??
      env.NEXT_PUBLIC_RIPENGINE_ADDRESS ??
      record.address,
    "RIPENGINE_ADDRESS"
  );
  const admin = requireAddress(
    env.RIPENGINE_ADMIN ?? record.admin,
    "RIPENGINE_ADMIN (constructor arg — set in env or deployment record)"
  );
  const randomness = requireAddress(
    record.randomness,
    "randomness (from deployment record)"
  );
  const packs = requireAddress(
    env.PACKCUSTODY_ADDRESS ?? record.packs,
    "PACKCUSTODY_ADDRESS"
  );
  const registry = requireAddress(
    env.ASSETREGISTRY_ADDRESS ?? record.registry,
    "ASSETREGISTRY_ADDRESS"
  );
  const stablecoin = requireAddress(
    env.MOCKUSD_ADDRESS ?? record.stablecoin,
    "MOCKUSD_ADDRESS"
  );
  const seed = env.RIPENGINE_SEED ?? DEFAULT_SEED;

  console.log(
    `Verifying MockRandomness at ${randomness} (admin=${admin}, seed=${seed})…`
  );
  console.log(
    runForgeVerifyBlockscout({
      address: randomness,
      contractPath: "src/mocks/MockRandomness.sol:MockRandomness",
      constructorArgsHex: castAbiEncode("constructor(address,uint256)", [
        admin,
        seed,
      ]),
    })
  );
  console.log(
    `Explorer: ${ROBINHOOD_TESTNET_EXPLORER}/address/${randomness}#code`
  );

  console.log(
    `\nVerifying RipEngine at ${engine} (admin=${admin}, packs=${packs}, registry=${registry}, stablecoin=${stablecoin}, randomness=${randomness})…`
  );
  console.log(
    runForgeVerifyBlockscout({
      address: engine,
      contractPath: "src/RipEngine.sol:RipEngine",
      constructorArgsHex: castAbiEncode(
        "constructor(address,address,address,address,address)",
        [admin, packs, registry, stablecoin, randomness]
      ),
    })
  );
  console.log(`Explorer: ${ROBINHOOD_TESTNET_EXPLORER}/address/${engine}#code`);
}

main();
