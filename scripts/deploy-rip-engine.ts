/**
 * Deploy RipEngine + MockRandomness to Robinhood Chain testnet and grant
 * PackCustody RIP_ENGINE_ROLE.
 *
 * Requires in .env.local (or shell):
 *   DEPLOYER_PRIVATE_KEY (or OPERATOR_PRIVATE_KEY)
 *   ROBINHOOD_TESTNET_RPC_URL
 *   PACKCUSTODY_ADDRESS
 *   ASSETREGISTRY_ADDRESS
 *   MOCKUSD_ADDRESS
 *
 * Optional:
 *   RIPENGINE_ADMIN       — defaults to deployer
 *   RIPENGINE_SEED        — MockRandomness base seed
 *   RIPENGINE_GRANT_ROLE  — "true"/"false"; default true
 *
 * Usage: pnpm deploy:rip-engine
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
  if (!env.PACKCUSTODY_ADDRESS) {
    throw new Error("PACKCUSTODY_ADDRESS missing in .env.local");
  }
  if (!env.ASSETREGISTRY_ADDRESS) {
    throw new Error("ASSETREGISTRY_ADDRESS missing in .env.local");
  }
  if (!env.MOCKUSD_ADDRESS) {
    throw new Error("MOCKUSD_ADDRESS missing in .env.local");
  }

  console.log("Deploying RipEngine to Robinhood Chain testnet…");

  const forgeEnv: Record<string, string> = {
    DEPLOYER_PRIVATE_KEY: deployerKey,
    PACKCUSTODY_ADDRESS: env.PACKCUSTODY_ADDRESS,
    ASSETREGISTRY_ADDRESS: env.ASSETREGISTRY_ADDRESS,
    MOCKUSD_ADDRESS: env.MOCKUSD_ADDRESS,
  };
  if (env.RIPENGINE_ADMIN) {
    forgeEnv.RIPENGINE_ADMIN = env.RIPENGINE_ADMIN;
  }
  if (env.RIPENGINE_SEED) {
    forgeEnv.RIPENGINE_SEED = env.RIPENGINE_SEED;
  }
  if (env.RIPENGINE_GRANT_ROLE) {
    forgeEnv.RIPENGINE_GRANT_ROLE = env.RIPENGINE_GRANT_ROLE;
  }

  const { address } = runForgeDeploy({
    scriptTarget: "script/DeployRipEngine.s.sol:DeployRipEngine",
    rpcUrl,
    privateKey: deployerKey,
    addressLabel: "RipEngine",
    env: forgeEnv,
  });

  const broadcast = readLatestBroadcastCreate({
    scriptFileName: "DeployRipEngine.s.sol",
    chainId: ROBINHOOD_TESTNET_CHAIN_ID,
  });

  const record = enrichDeploymentRecord("robinhood-testnet.rip-engine.json", {
    address,
    txHash: broadcast?.txHash,
    blockNumber: broadcast?.blockNumber,
  });

  patchEnvLocal("RIPENGINE_ADDRESS", address);
  patchEnvLocal("NEXT_PUBLIC_RIPENGINE_ADDRESS", address);

  console.log(`\nUpdated .env.local:`);
  console.log(`  RIPENGINE_ADDRESS=${address}`);
  console.log(`  NEXT_PUBLIC_RIPENGINE_ADDRESS=${address}`);
  console.log(
    `\nRecorded deployment in contracts/deployments/robinhood-testnet.rip-engine.json`
  );
  console.log(`Explorer: ${ROBINHOOD_TESTNET_EXPLORER}/address/${address}`);
  if (record.txHash) {
    console.log(`Tx: ${ROBINHOOD_TESTNET_EXPLORER}/tx/${record.txHash}`);
  }
}

main();
