/**
 * Deploy SeatVault to Base Sepolia.
 *
 * Requires in .env.local:
 *   OPERATOR_PRIVATE_KEY
 *   NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL
 *   MARGINCALL_TOKEN (or NEXT_PUBLIC_MARGINCALL_TOKEN)
 *   ESCROW_ADDRESS (or NEXT_PUBLIC_ESCROW_ADDRESS)
 *
 * Optional forge env: SEAT_THRESHOLD, CORNER_THRESHOLD, UNSTAKE_COOLDOWN
 *
 * Usage: pnpm deploy:seat-vault
 */
import {
  appendDeploymentRecord,
  loadEnvLocal,
  patchEnvLocal,
  runForgeDeploy,
} from "./deploy-utils";

/** Pull a uint logged by the forge script (e.g. "Seat threshold: 10000…"). */
function parseLoggedUint(output: string, label: string): string {
  const match = output.match(new RegExp(`${label}:\\s*(\\d+)`));
  if (!match) {
    throw new Error(`Could not parse "${label}" from forge output`);
  }
  return match[1] as string;
}

function main() {
  const env = loadEnvLocal();
  const rpcUrl = env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL;
  const operatorKey = env.OPERATOR_PRIVATE_KEY;
  const margincallToken =
    env.MARGINCALL_TOKEN ?? env.NEXT_PUBLIC_MARGINCALL_TOKEN;
  const escrowAddress = env.ESCROW_ADDRESS ?? env.NEXT_PUBLIC_ESCROW_ADDRESS;

  if (!rpcUrl) {
    throw new Error("NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL missing in .env.local");
  }
  if (!operatorKey) {
    throw new Error("OPERATOR_PRIVATE_KEY missing in .env.local");
  }
  if (!margincallToken) {
    throw new Error(
      "MARGINCALL_TOKEN missing — run pnpm deploy:margincall-token first"
    );
  }
  if (!escrowAddress) {
    throw new Error(
      "ESCROW_ADDRESS missing — run pnpm deploy:escrow or set manually"
    );
  }

  console.log(
    `Deploying SeatVault (token ${margincallToken}, escrow ${escrowAddress})…`
  );

  const forgeEnv: Record<string, string> = {
    MARGINCALL_TOKEN: margincallToken,
    ESCROW_ADDRESS: escrowAddress,
  };
  if (env.SEAT_THRESHOLD) forgeEnv.SEAT_THRESHOLD = env.SEAT_THRESHOLD;
  if (env.CORNER_THRESHOLD) forgeEnv.CORNER_THRESHOLD = env.CORNER_THRESHOLD;
  if (env.UNSTAKE_COOLDOWN) forgeEnv.UNSTAKE_COOLDOWN = env.UNSTAKE_COOLDOWN;

  const { address, output } = runForgeDeploy({
    scriptTarget: "script/DeploySeatVault.s.sol:DeploySeatVault",
    rpcUrl,
    privateKey: operatorKey,
    addressLabel: "SeatVault",
    env: forgeEnv,
  });

  patchEnvLocal("SEAT_VAULT_ADDRESS", address);
  patchEnvLocal("NEXT_PUBLIC_SEAT_VAULT_ADDRESS", address);

  const version = appendDeploymentRecord("base-sepolia.seat-vaults.json", {
    address,
    margincallToken,
    escrow: escrowAddress,
    // Record the values actually applied on-chain (defaults live in the .sol script).
    seatThreshold: parseLoggedUint(output, "Seat threshold"),
    cornerOfficeThreshold: parseLoggedUint(output, "Corner threshold"),
    unstakeCooldown: parseLoggedUint(output, "Unstake cooldown"),
    deployedAt: new Date().toISOString(),
  });

  console.log(`\nUpdated .env.local:`);
  console.log(`  SEAT_VAULT_ADDRESS=${address}`);
  console.log(`  NEXT_PUBLIC_SEAT_VAULT_ADDRESS=${address}`);
  console.log(`\nRecorded deployment v${version} in contracts/deployments/`);
  console.log(`BaseScan: https://sepolia.basescan.org/address/${address}`);
}

main();
