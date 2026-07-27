/**
 * Source-verify MockUSD on Robinhood Chain testnet (Blockscout).
 *
 * Requires:
 *   MOCKUSD_ADDRESS / NEXT_PUBLIC_MOCKUSD_ADDRESS (or --address=0x…)
 *   Admin address used at deploy (MOCKUSD_ADMIN, or read from the deployment record)
 *
 * Usage: pnpm verify:mockusd
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
};

function readDeploymentRecord(): DeploymentRecord {
  const path = join(
    CONTRACTS_DIR,
    "deployments",
    "robinhood-testnet.mockusd.json"
  );
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as DeploymentRecord;
}

function parseAddressFlag(argv: string[]): string | undefined {
  const flag = argv.find((a) => a.startsWith("--address="));
  return flag ? flag.slice("--address=".length) : undefined;
}

function main() {
  const env = loadEnvLocal();
  const record = readDeploymentRecord();
  const address = requireAddress(
    parseAddressFlag(process.argv) ??
      env.MOCKUSD_ADDRESS ??
      env.NEXT_PUBLIC_MOCKUSD_ADDRESS ??
      record.address,
    "MOCKUSD_ADDRESS"
  );
  const admin = requireAddress(
    env.MOCKUSD_ADMIN ?? record.admin,
    "MOCKUSD_ADMIN (constructor arg — set in env or deployment record)"
  );

  const constructorArgsHex = castAbiEncode("constructor(address)", [admin]);

  console.log(`Verifying MockUSD at ${address} (admin=${admin})…`);
  const output = runForgeVerifyBlockscout({
    address,
    contractPath: "src/MockUSD.sol:MockUSD",
    constructorArgsHex,
  });
  console.log(output);
  console.log(
    `Explorer: ${ROBINHOOD_TESTNET_EXPLORER}/address/${address}#code`
  );
}

main();
