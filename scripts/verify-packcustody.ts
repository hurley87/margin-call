/**
 * Source-verify PackCustody on Robinhood Chain testnet (Blockscout).
 *
 * Requires:
 *   PACKCUSTODY_ADDRESS / NEXT_PUBLIC_PACKCUSTODY_ADDRESS (or --address=0x…)
 *   The admin and whitelist used at deploy — read from the deployment record, or
 *   overridden with PACKCUSTODY_ADMIN / PACKCUSTODY_WHITELIST.
 *
 * Usage: pnpm verify:packcustody
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
  whitelist?: string[];
};

function readDeploymentRecord(): DeploymentRecord {
  const path = join(
    CONTRACTS_DIR,
    "deployments",
    "robinhood-testnet.packcustody.json"
  );
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as DeploymentRecord;
}

function parseAddressFlag(argv: string[]): string | undefined {
  const flag = argv.find((a) => a.startsWith("--address="));
  return flag ? flag.slice("--address=".length) : undefined;
}

function resolveWhitelist(
  env: Record<string, string>,
  record: DeploymentRecord
): `0x${string}`[] {
  const raw = env.PACKCUSTODY_WHITELIST
    ? env.PACKCUSTODY_WHITELIST.split(",")
    : record.whitelist;

  if (!raw?.length) {
    throw new Error(
      "PACKCUSTODY_WHITELIST missing — set it, or deploy first so the record carries the constructor whitelist"
    );
  }

  return raw.map((asset, i) =>
    requireAddress(asset.trim(), `PACKCUSTODY_WHITELIST[${i}]`)
  );
}

function main() {
  const env = loadEnvLocal();
  const record = readDeploymentRecord();

  const address = requireAddress(
    parseAddressFlag(process.argv) ??
      env.PACKCUSTODY_ADDRESS ??
      env.NEXT_PUBLIC_PACKCUSTODY_ADDRESS ??
      record.address,
    "PACKCUSTODY_ADDRESS"
  );
  const admin = requireAddress(
    env.PACKCUSTODY_ADMIN ?? record.admin,
    "PACKCUSTODY_ADMIN (constructor arg — set in env or deployment record)"
  );
  const whitelist = resolveWhitelist(env, record);

  const constructorArgsHex = castAbiEncode("constructor(address,address[])", [
    admin,
    `[${whitelist.join(",")}]`,
  ]);

  console.log(
    `Verifying PackCustody at ${address} (admin=${admin}, ${whitelist.length} whitelisted assets)…`
  );
  const output = runForgeVerifyBlockscout({
    address,
    contractPath: "src/PackCustody.sol:PackCustody",
    constructorArgsHex,
  });
  console.log(output);
  console.log(
    `Explorer: ${ROBINHOOD_TESTNET_EXPLORER}/address/${address}#code`
  );
}

main();
