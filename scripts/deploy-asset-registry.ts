/**
 * Deploy AssetRegistry to Robinhood Chain testnet, seed MockPriceFeeds + launch five.
 *
 * Requires in .env.local (or shell):
 *   DEPLOYER_PRIVATE_KEY (or OPERATOR_PRIVATE_KEY)
 *   ROBINHOOD_TESTNET_RPC_URL
 *
 * Optional:
 *   ASSETREGISTRY_ADMIN       — defaults to deployer
 *   ASSETREGISTRY_INVENTORY   — granted INVENTORY_ROLE when admin == deployer
 *   ASSETREGISTRY_STALE_AFTER — seconds; default 3600
 *   ASSETREGISTRY_SEED_FEEDS  — "true"/"false"; default true
 *
 * Usage: pnpm deploy:asset-registry
 *
 * Does not require a live deploy in every PR — scripts land with #300; testnet
 * wire-up and Blockscout verify are tracked in #310.
 */
import {
  enrichDeploymentRecord,
  loadEnvLocal,
  patchEnvLocal,
  readLatestBroadcastCreate,
  ROBINHOOD_TESTNET_CHAIN_ID,
  ROBINHOOD_TESTNET_EXPLORER,
  runForgeDeploy,
} from "./deploy-utils";

function main() {
  const env = loadEnvLocal();
  const rpcUrl =
    env.ROBINHOOD_TESTNET_RPC_URL ?? env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL;
  const deployerKey = env.DEPLOYER_PRIVATE_KEY ?? env.OPERATOR_PRIVATE_KEY;
  if (!rpcUrl) {
    throw new Error("ROBINHOOD_TESTNET_RPC_URL missing in .env.local");
  }
  if (!deployerKey) {
    throw new Error(
      "DEPLOYER_PRIVATE_KEY (or OPERATOR_PRIVATE_KEY) missing — set it, or export from a Foundry keystore with `cast wallet private-key --account <name>`"
    );
  }

  console.log("Deploying AssetRegistry to Robinhood Chain testnet…");

  const forgeEnv: Record<string, string> = {
    DEPLOYER_PRIVATE_KEY: deployerKey,
  };
  if (env.ASSETREGISTRY_ADMIN) {
    forgeEnv.ASSETREGISTRY_ADMIN = env.ASSETREGISTRY_ADMIN;
  }
  if (env.ASSETREGISTRY_INVENTORY) {
    forgeEnv.ASSETREGISTRY_INVENTORY = env.ASSETREGISTRY_INVENTORY;
  }
  if (env.ASSETREGISTRY_STALE_AFTER) {
    forgeEnv.ASSETREGISTRY_STALE_AFTER = env.ASSETREGISTRY_STALE_AFTER;
  }
  if (env.ASSETREGISTRY_SEED_FEEDS) {
    forgeEnv.ASSETREGISTRY_SEED_FEEDS = env.ASSETREGISTRY_SEED_FEEDS;
  }

  const { address } = runForgeDeploy({
    scriptTarget: "script/DeployAssetRegistry.s.sol:DeployAssetRegistry",
    rpcUrl,
    privateKey: deployerKey,
    addressLabel: "AssetRegistry",
    env: forgeEnv,
  });

  const broadcast = readLatestBroadcastCreate({
    scriptFileName: "DeployAssetRegistry.s.sol",
    chainId: ROBINHOOD_TESTNET_CHAIN_ID,
  });

  const record = enrichDeploymentRecord(
    "robinhood-testnet.asset-registry.json",
    {
      address,
      txHash: broadcast?.txHash,
      blockNumber: broadcast?.blockNumber,
    }
  );

  patchEnvLocal("ASSETREGISTRY_ADDRESS", address);
  patchEnvLocal("NEXT_PUBLIC_ASSETREGISTRY_ADDRESS", address);

  console.log(`\nUpdated .env.local:`);
  console.log(`  ASSETREGISTRY_ADDRESS=${address}`);
  console.log(`  NEXT_PUBLIC_ASSETREGISTRY_ADDRESS=${address}`);
  console.log(
    `\nRecorded deployment in contracts/deployments/robinhood-testnet.asset-registry.json`
  );
  console.log(`Explorer: ${ROBINHOOD_TESTNET_EXPLORER}/address/${address}`);
  if (record.txHash) {
    console.log(`Tx: ${ROBINHOOD_TESTNET_EXPLORER}/tx/${record.txHash}`);
  }
}

main();
