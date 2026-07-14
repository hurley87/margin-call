/**
 * Deploy MARGINCALL test token to Base Sepolia.
 *
 * Requires in .env.local:
 *   OPERATOR_PRIVATE_KEY
 *   NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL
 *
 * Optional env for forge: INITIAL_MINT (default 1_000_000e18)
 *
 * Usage: pnpm deploy:margincall-token
 */
import {
  appendDeploymentRecord,
  loadEnvLocal,
  patchEnvLocal,
  requireGate1Approval,
  runForgeDeploy,
} from "./deploy-utils";

function main() {
  const env = loadEnvLocal();
  requireGate1Approval(env);
  const rpcUrl = env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL;
  const operatorKey = env.OPERATOR_PRIVATE_KEY;
  if (!rpcUrl) {
    throw new Error("NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL missing in .env.local");
  }
  if (!operatorKey) {
    throw new Error("OPERATOR_PRIVATE_KEY missing in .env.local");
  }

  console.log("Deploying MARGINCALL token to Base Sepolia…");

  const { address } = runForgeDeploy({
    scriptTarget: "script/DeployMarginCallToken.s.sol:DeployMarginCallToken",
    rpcUrl,
    privateKey: operatorKey,
    addressLabel: "MARGINCALL",
    env: { INITIAL_MINT: env.INITIAL_MINT ?? "1000000000000000000000000" },
  });

  patchEnvLocal("MARGINCALL_TOKEN", address);
  patchEnvLocal("NEXT_PUBLIC_MARGINCALL_TOKEN", address);

  const version = appendDeploymentRecord(
    "base-sepolia.margincall-tokens.json",
    {
      address,
      symbol: "MARGINCALL",
      deployedAt: new Date().toISOString(),
    }
  );

  console.log(`\nUpdated .env.local:`);
  console.log(`  MARGINCALL_TOKEN=${address}`);
  console.log(`  NEXT_PUBLIC_MARGINCALL_TOKEN=${address}`);
  console.log(`\nRecorded deployment v${version} in contracts/deployments/`);
  console.log(`BaseScan: https://sepolia.basescan.org/address/${address}`);
}

main();
