/**
 * Live Robinhood testnet E2E: create Packs → enterPool → rip → claim Acquisition Fees.
 *
 * Requires faucet Stock Tokens on the deployer and MockUSD admin (grants MINTER_ROLE if needed).
 *
 * Usage: pnpm testnet:e2e
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  CONTRACTS_DIR,
  loadEnvLocal,
  ROBINHOOD_TESTNET_CHAIN_ID,
  ROBINHOOD_TESTNET_EXPLORER,
} from "./deploy-utils";

type AssetRegistryRecord = {
  feeds?: string[];
};

function readFeeds(): string[] {
  const path = join(
    CONTRACTS_DIR,
    "deployments",
    "robinhood-testnet.asset-registry.json"
  );
  if (!existsSync(path)) return [];
  const record = JSON.parse(readFileSync(path, "utf8")) as AssetRegistryRecord;
  return record.feeds ?? [];
}

function main() {
  const env = loadEnvLocal();
  const rpcUrl =
    env.ROBINHOOD_TESTNET_RPC_URL ?? env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL;
  const deployerKey = env.DEPLOYER_PRIVATE_KEY ?? env.OPERATOR_PRIVATE_KEY;
  if (!rpcUrl) {
    throw new Error("ROBINHOOD_TESTNET_RPC_URL missing in .env.local");
  }
  if (!deployerKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY (or OPERATOR_PRIVATE_KEY) missing");
  }
  for (const key of [
    "PACKCUSTODY_ADDRESS",
    "RIPENGINE_ADDRESS",
    "MOCKUSD_ADDRESS",
  ] as const) {
    if (!env[key]) {
      throw new Error(
        `${key} missing in .env.local — deploy V1 contracts first`
      );
    }
  }

  const forgeEnv: Record<string, string> = {
    DEPLOYER_PRIVATE_KEY: deployerKey,
    PACKCUSTODY_ADDRESS: env.PACKCUSTODY_ADDRESS,
    RIPENGINE_ADDRESS: env.RIPENGINE_ADDRESS,
    MOCKUSD_ADDRESS: env.MOCKUSD_ADDRESS,
  };
  if (env.ASSETREGISTRY_ADDRESS) {
    forgeEnv.ASSETREGISTRY_ADDRESS = env.ASSETREGISTRY_ADDRESS;
  }

  const feeds = readFeeds();
  feeds.forEach((feed, i) => {
    forgeEnv[`FEED_${i}`] = feed;
  });

  console.log(
    `Running create → rip → claim E2E on chain ${ROBINHOOD_TESTNET_CHAIN_ID}…`
  );

  const output = execFileSync(
    "forge",
    [
      "script",
      "script/TestnetCreateRipClaim.s.sol:TestnetCreateRipClaim",
      "--rpc-url",
      rpcUrl,
      "--private-key",
      deployerKey,
      "--broadcast",
      "--gas-estimate-multiplier",
      "400",
      "-vv",
    ],
    {
      cwd: CONTRACTS_DIR,
      env: { ...process.env, ...forgeEnv },
      encoding: "utf8",
    }
  );
  console.log(output);

  if (!output.includes("E2E create -> rip -> claim OK")) {
    throw new Error("E2E script did not report success");
  }

  console.log(`Explorer: ${ROBINHOOD_TESTNET_EXPLORER}`);
}

main();
