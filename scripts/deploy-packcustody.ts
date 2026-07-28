/**
 * Deploy PackCustody to Robinhood Chain testnet and record the address.
 *
 * Requires in .env.local (or shell):
 *   DEPLOYER_PRIVATE_KEY (or OPERATOR_PRIVATE_KEY)
 *   ROBINHOOD_TESTNET_RPC_URL
 *
 * Optional:
 *   PACKCUSTODY_ADMIN           — defaults to deployer
 *   PACKCUSTODY_WHITELIST_ADMIN — granted WHITELIST_ADMIN_ROLE when admin == deployer
 *   PACKCUSTODY_WHITELIST       — comma-separated assets; defaults to the five approved
 *                                 Stock Tokens in the PRD launch configuration
 *
 * Usage: pnpm deploy:packcustody
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

  console.log("Deploying PackCustody to Robinhood Chain testnet…");

  const forgeEnv: Record<string, string> = {
    DEPLOYER_PRIVATE_KEY: deployerKey,
  };
  if (env.PACKCUSTODY_ADMIN) forgeEnv.PACKCUSTODY_ADMIN = env.PACKCUSTODY_ADMIN;
  if (env.PACKCUSTODY_WHITELIST_ADMIN) {
    forgeEnv.PACKCUSTODY_WHITELIST_ADMIN = env.PACKCUSTODY_WHITELIST_ADMIN;
  }
  if (env.PACKCUSTODY_WHITELIST) {
    forgeEnv.PACKCUSTODY_WHITELIST = env.PACKCUSTODY_WHITELIST;
  }

  const { address } = runForgeDeploy({
    scriptTarget: "script/DeployPackCustody.s.sol:DeployPackCustody",
    rpcUrl,
    privateKey: deployerKey,
    addressLabel: "PackCustody",
    env: forgeEnv,
  });

  const broadcast = readLatestBroadcastCreate({
    scriptFileName: "DeployPackCustody.s.sol",
    chainId: ROBINHOOD_TESTNET_CHAIN_ID,
  });

  const record = enrichDeploymentRecord("robinhood-testnet.packcustody.json", {
    address,
    txHash: broadcast?.txHash,
    blockNumber: broadcast?.blockNumber,
  });

  patchEnvLocal("PACKCUSTODY_ADDRESS", address);
  patchEnvLocal("NEXT_PUBLIC_PACKCUSTODY_ADDRESS", address);

  console.log(`\nUpdated .env.local:`);
  console.log(`  PACKCUSTODY_ADDRESS=${address}`);
  console.log(`  NEXT_PUBLIC_PACKCUSTODY_ADDRESS=${address}`);
  console.log(
    `\nRecorded deployment in contracts/deployments/robinhood-testnet.packcustody.json`
  );
  console.log(`Explorer: ${ROBINHOOD_TESTNET_EXPLORER}/address/${address}`);
  if (record.txHash) {
    console.log(`Tx: ${ROBINHOOD_TESTNET_EXPLORER}/tx/${record.txHash}`);
  }
}

main();
