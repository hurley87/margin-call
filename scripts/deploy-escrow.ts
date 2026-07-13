/**
 * Deploy MarginCallEscrow to Base Sepolia and patch NEXT_PUBLIC_ESCROW_ADDRESS in .env.local.
 *
 * Requires in .env.local:
 *   OPERATOR_PRIVATE_KEY
 *   NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL
 *
 * Usage: pnpm deploy:escrow
 */
import { privateKeyToAccount } from "viem/accounts";
import { loadEnvLocal, patchEnvLocal, runForgeDeploy } from "./deploy-utils";

function main() {
  const env = loadEnvLocal();
  const rpcUrl = env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL;
  const operatorKey = env.OPERATOR_PRIVATE_KEY;
  if (!rpcUrl)
    throw new Error("NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL missing in .env.local");
  if (!operatorKey)
    throw new Error("OPERATOR_PRIVATE_KEY missing in .env.local");

  const operatorAddress = privateKeyToAccount(
    operatorKey as `0x${string}`
  ).address;

  console.log(
    `Deploying MarginCallEscrow with settlement operator ${operatorAddress}…`
  );

  const { address } = runForgeDeploy({
    scriptTarget: "script/DeployMarginCallEscrow.s.sol:DeployMarginCallEscrow",
    rpcUrl,
    privateKey: operatorKey,
    addressLabel: "MarginCallEscrow",
    env: {
      SETTLEMENT_OPERATOR_ADDRESS: operatorAddress,
      DEPOSITOR_BINDER_ADDRESS: operatorAddress,
      ENTRY_TIMEOUT_SECONDS: "3600",
    },
  });

  patchEnvLocal("NEXT_PUBLIC_ESCROW_ADDRESS", address);
  patchEnvLocal("ESCROW_ADDRESS", address);

  console.log(`\nUpdated .env.local:`);
  console.log(`  NEXT_PUBLIC_ESCROW_ADDRESS=${address}`);
  console.log(`  ESCROW_ADDRESS=${address}`);
  console.log(`\nAlso set in Convex (dev + prod):`);
  console.log(`  npx convex env set ESCROW_ADDRESS ${address}`);
  console.log(`\nBaseScan: https://sepolia.basescan.org/address/${address}`);
}

main();
