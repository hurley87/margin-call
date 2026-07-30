/**
 * Source-verify AssetRegistry + seeded MockPriceFeeds on Robinhood Chain testnet (Blockscout).
 *
 * Requires deployment record (or env) with address, admin, feeds, and seed prices.
 *
 * Usage: pnpm verify:asset-registry
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

/** Must match `LaunchTokens.seedPrices8()` — 8-decimal USD seeds used at deploy. */
const SEED_PRICES_8 = [
  "18500000000", // AMZN
  "16000000000", // AMD
  "70000000000", // NFLX
  "4000000000", // PLTR
  "25000000000", // TSLA
] as const;

const FEED_DECIMALS = "8";

type DeploymentRecord = {
  address?: string;
  admin?: string;
  feeds?: string[];
  symbols?: string[];
};

function readDeploymentRecord(): DeploymentRecord {
  const path = join(
    CONTRACTS_DIR,
    "deployments",
    "robinhood-testnet.asset-registry.json"
  );
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as DeploymentRecord;
}

function main() {
  const env = loadEnvLocal();
  const record = readDeploymentRecord();

  const registry = requireAddress(
    env.ASSETREGISTRY_ADDRESS ??
      env.NEXT_PUBLIC_ASSETREGISTRY_ADDRESS ??
      record.address,
    "ASSETREGISTRY_ADDRESS"
  );
  const admin = requireAddress(
    env.ASSETREGISTRY_ADMIN ?? record.admin,
    "ASSETREGISTRY_ADMIN (constructor arg — set in env or deployment record)"
  );

  console.log(`Verifying AssetRegistry at ${registry} (admin=${admin})…`);
  console.log(
    runForgeVerifyBlockscout({
      address: registry,
      contractPath: "src/AssetRegistry.sol:AssetRegistry",
      constructorArgsHex: castAbiEncode("constructor(address)", [admin]),
    })
  );
  console.log(
    `Explorer: ${ROBINHOOD_TESTNET_EXPLORER}/address/${registry}#code`
  );

  const feeds = record.feeds ?? [];
  if (feeds.length === 0) {
    console.log(
      "No feeds in deployment record — skipping MockPriceFeed verify"
    );
    return;
  }
  if (feeds.length !== SEED_PRICES_8.length) {
    throw new Error(
      `Expected ${SEED_PRICES_8.length} feeds, got ${feeds.length} in deployment record`
    );
  }

  for (let i = 0; i < feeds.length; i++) {
    const feed = requireAddress(feeds[i], `feeds[${i}]`);
    const symbol = record.symbols?.[i] ?? `feed[${i}]`;
    const price = SEED_PRICES_8[i]!;
    console.log(
      `\nVerifying MockPriceFeed ${symbol} at ${feed} (admin=${admin}, decimals=${FEED_DECIMALS}, price=${price})…`
    );
    console.log(
      runForgeVerifyBlockscout({
        address: feed,
        contractPath: "src/mocks/MockPriceFeed.sol:MockPriceFeed",
        constructorArgsHex: castAbiEncode(
          "constructor(address,uint8,uint256)",
          [admin, FEED_DECIMALS, price]
        ),
      })
    );
    console.log(`Explorer: ${ROBINHOOD_TESTNET_EXPLORER}/address/${feed}#code`);
  }
}

main();
