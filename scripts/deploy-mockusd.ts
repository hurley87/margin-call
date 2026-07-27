/**
 * Deploy MockUSD to Robinhood Chain testnet and record the address.
 *
 * Requires in .env.local (or shell):
 *   DEPLOYER_PRIVATE_KEY (or OPERATOR_PRIVATE_KEY)
 *   ROBINHOOD_TESTNET_RPC_URL
 *
 * Optional:
 *   MOCKUSD_ADMIN  — defaults to deployer
 *   MOCKUSD_MINTER — granted MINTER_ROLE when admin == deployer
 *
 * Usage: pnpm deploy:mockusd
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

  console.log("Deploying MockUSD to Robinhood Chain testnet…");

  const forgeEnv: Record<string, string> = {
    DEPLOYER_PRIVATE_KEY: deployerKey,
  };
  if (env.MOCKUSD_ADMIN) forgeEnv.MOCKUSD_ADMIN = env.MOCKUSD_ADMIN;
  if (env.MOCKUSD_MINTER) forgeEnv.MOCKUSD_MINTER = env.MOCKUSD_MINTER;

  const { address } = runForgeDeploy({
    scriptTarget: "script/DeployMockUSD.s.sol:DeployMockUSD",
    rpcUrl,
    privateKey: deployerKey,
    addressLabel: "MockUSD",
    env: forgeEnv,
  });

  const broadcast = readLatestBroadcastCreate({
    scriptFileName: "DeployMockUSD.s.sol",
    chainId: ROBINHOOD_TESTNET_CHAIN_ID,
  });

  const record = enrichDeploymentRecord("robinhood-testnet.mockusd.json", {
    address,
    txHash: broadcast?.txHash,
    blockNumber: broadcast?.blockNumber,
  });

  patchEnvLocal("MOCKUSD_ADDRESS", address);
  patchEnvLocal("NEXT_PUBLIC_MOCKUSD_ADDRESS", address);

  console.log(`\nUpdated .env.local:`);
  console.log(`  MOCKUSD_ADDRESS=${address}`);
  console.log(`  NEXT_PUBLIC_MOCKUSD_ADDRESS=${address}`);
  console.log(
    `\nRecorded deployment in contracts/deployments/robinhood-testnet.mockusd.json`
  );
  console.log(`Explorer: ${ROBINHOOD_TESTNET_EXPLORER}/address/${address}`);
  if (record.txHash) {
    console.log(`Tx: ${ROBINHOOD_TESTNET_EXPLORER}/tx/${record.txHash}`);
  }
}

main();
