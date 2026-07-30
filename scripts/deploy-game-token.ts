/**
 * Deploy GameToken to Robinhood Chain testnet. The whole fixed supply is minted to the
 * treasury at deploy — there is no mint authority afterwards, so the supply is final.
 *
 * Requires in .env.local (or shell):
 *   DEPLOYER_PRIVATE_KEY (or OPERATOR_PRIVATE_KEY)
 *   ROBINHOOD_TESTNET_RPC_URL
 *
 * Optional:
 *   GAMETOKEN_ADMIN     — defaults to deployer
 *   GAMETOKEN_TREASURY  — defaults to deployer; receives the whole supply
 *   GAMETOKEN_SUPPLY    — 18-decimal units; default 1000000000000000000000000000 (1e9 tokens)
 *
 * Usage: pnpm deploy:game-token
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

  console.log("Deploying GameToken to Robinhood Chain testnet…");

  const forgeEnv: Record<string, string> = {
    DEPLOYER_PRIVATE_KEY: deployerKey,
  };
  for (const key of [
    "GAMETOKEN_ADMIN",
    "GAMETOKEN_TREASURY",
    "GAMETOKEN_SUPPLY",
  ]) {
    if (env[key]) {
      forgeEnv[key] = env[key];
    }
  }

  const { address } = runForgeDeploy({
    scriptTarget: "script/DeployGameToken.s.sol:DeployGameToken",
    rpcUrl,
    privateKey: deployerKey,
    addressLabel: "GameToken",
    env: forgeEnv,
  });

  const broadcast = readLatestBroadcastCreate({
    scriptFileName: "DeployGameToken.s.sol",
    chainId: ROBINHOOD_TESTNET_CHAIN_ID,
  });

  const record = enrichDeploymentRecord("robinhood-testnet.game-token.json", {
    address,
    txHash: broadcast?.txHash,
    blockNumber: broadcast?.blockNumber,
  });

  patchEnvLocal("GAMETOKEN_ADDRESS", address);
  patchEnvLocal("NEXT_PUBLIC_GAMETOKEN_ADDRESS", address);

  console.log(`\nUpdated .env.local:`);
  console.log(`  GAMETOKEN_ADDRESS=${address}`);
  console.log(`  NEXT_PUBLIC_GAMETOKEN_ADDRESS=${address}`);
  console.log(
    `\nRecorded deployment in contracts/deployments/robinhood-testnet.game-token.json`
  );
  console.log(`Explorer: ${ROBINHOOD_TESTNET_EXPLORER}/address/${address}`);
  if (record.txHash) {
    console.log(`Tx: ${ROBINHOOD_TESTNET_EXPLORER}/tx/${record.txHash}`);
  }
}

main();
