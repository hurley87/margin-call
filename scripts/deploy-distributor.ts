/**
 * Deploy Distributor to Robinhood Chain testnet, grant it the GameToken DISTRIBUTOR_ROLE so
 * claims (and funding transfers) pass the transfer lock, and optionally fund it.
 *
 * Requires in .env.local (or shell):
 *   DEPLOYER_PRIVATE_KEY (or OPERATOR_PRIVATE_KEY)
 *   ROBINHOOD_TESTNET_RPC_URL
 *   GAMETOKEN_ADDRESS
 *
 * Optional:
 *   DISTRIBUTOR_ADMIN       — defaults to deployer
 *   DISTRIBUTOR_GRANT_ROLE  — "true"/"false"; default true
 *   DISTRIBUTOR_FUND        — 18-decimal units transferred from the deployer after the grant
 *   DISTRIBUTOR_MAKER_RATE  — `makerRatePerEpoch`
 *   DISTRIBUTOR_TAKER_POT   — `takerPotPerEpoch`
 *
 * Usage: pnpm deploy:distributor
 *
 * Testnet wire-up and Blockscout verify are tracked in #310.
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
  if (!env.GAMETOKEN_ADDRESS) {
    throw new Error(
      "GAMETOKEN_ADDRESS missing in .env.local — run `pnpm deploy:game-token` first"
    );
  }

  console.log("Deploying Distributor to Robinhood Chain testnet…");

  const forgeEnv: Record<string, string> = {
    DEPLOYER_PRIVATE_KEY: deployerKey,
    GAMETOKEN_ADDRESS: env.GAMETOKEN_ADDRESS,
  };
  for (const key of [
    "DISTRIBUTOR_ADMIN",
    "DISTRIBUTOR_GRANT_ROLE",
    "DISTRIBUTOR_FUND",
    "DISTRIBUTOR_MAKER_RATE",
    "DISTRIBUTOR_TAKER_POT",
  ]) {
    if (env[key]) {
      forgeEnv[key] = env[key];
    }
  }

  const { address } = runForgeDeploy({
    scriptTarget: "script/DeployDistributor.s.sol:DeployDistributor",
    rpcUrl,
    privateKey: deployerKey,
    addressLabel: "Distributor",
    env: forgeEnv,
  });

  const broadcast = readLatestBroadcastCreate({
    scriptFileName: "DeployDistributor.s.sol",
    chainId: ROBINHOOD_TESTNET_CHAIN_ID,
  });

  const record = enrichDeploymentRecord("robinhood-testnet.distributor.json", {
    address,
    txHash: broadcast?.txHash,
    blockNumber: broadcast?.blockNumber,
  });

  patchEnvLocal("DISTRIBUTOR_ADDRESS", address);
  patchEnvLocal("NEXT_PUBLIC_DISTRIBUTOR_ADDRESS", address);

  console.log(`\nUpdated .env.local:`);
  console.log(`  DISTRIBUTOR_ADDRESS=${address}`);
  console.log(`  NEXT_PUBLIC_DISTRIBUTOR_ADDRESS=${address}`);
  console.log(
    `\nRecorded deployment in contracts/deployments/robinhood-testnet.distributor.json`
  );
  console.log(`Explorer: ${ROBINHOOD_TESTNET_EXPLORER}/address/${address}`);
  if (record.txHash) {
    console.log(`Tx: ${ROBINHOOD_TESTNET_EXPLORER}/tx/${record.txHash}`);
  }
}

main();
