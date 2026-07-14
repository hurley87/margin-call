/**
 * Deploy SeatVault to Base Sepolia.
 *
 * Requires in .env.local:
 *   OPERATOR_PRIVATE_KEY
 *   NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL
 *   MARGINCALL_TOKEN (or NEXT_PUBLIC_MARGINCALL_TOKEN)
 *   ESCROW_ADDRESS (or NEXT_PUBLIC_ESCROW_ADDRESS)
 *
 * #211 default: reuse active MarginCallToken
 *   MARGINCALL_TOKEN=0x0d93099c1b24C848e7A7DD77c5a50de0735A60d7
 * Do not redeploy the token unless compatibility evidence requires replacement.
 *
 * Optional forge env: SEAT_THRESHOLD, CORNER_THRESHOLD, UNSTAKE_COOLDOWN
 *
 * Gate 1 human approval required before broadcast (#211).
 *
 * Usage: pnpm deploy:seat-vault
 */
import {
  appendDeploymentRecord,
  broadcastRecordFields,
  loadEnvLocal,
  patchEnvLocal,
  readLatestBroadcastCreate,
  requireAddress,
  requireGate1Approval,
  runForgeDeploy,
} from "./deploy-utils";
import { ACTIVE_BASE_SEPOLIA_DEPLOYMENT } from "../convex/lib/activeDeployment";

/** Active Base Sepolia MarginCallToken — prefer reuse for #211. */
const ACTIVE_MARGINCALL_TOKEN = ACTIVE_BASE_SEPOLIA_DEPLOYMENT.margincallToken;

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
  requireGate1Approval(env);
  const rpcUrl = env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL;
  const operatorKey = env.OPERATOR_PRIVATE_KEY;
  const margincallToken = requireAddress(
    env.MARGINCALL_TOKEN ?? env.NEXT_PUBLIC_MARGINCALL_TOKEN,
    "MARGINCALL_TOKEN"
  );
  const escrowAddress = requireAddress(
    env.ESCROW_ADDRESS ?? env.NEXT_PUBLIC_ESCROW_ADDRESS,
    "ESCROW_ADDRESS"
  );

  if (!rpcUrl) {
    throw new Error("NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL missing in .env.local");
  }
  if (!operatorKey) {
    throw new Error("OPERATOR_PRIVATE_KEY missing in .env.local");
  }

  if (margincallToken.toLowerCase() !== ACTIVE_MARGINCALL_TOKEN.toLowerCase()) {
    console.warn(
      `⚠ #211 default is token reuse (${ACTIVE_MARGINCALL_TOKEN}). You are deploying SeatVault against ${margincallToken} — only proceed with documented compatibility evidence.`
    );
  } else {
    console.log(
      `Reusing active MarginCallToken ${ACTIVE_MARGINCALL_TOKEN} (#211).`
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

  const broadcast = readLatestBroadcastCreate({
    scriptFileName: "DeploySeatVault.s.sol",
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
    ...broadcastRecordFields(broadcast),
    deployedAt: new Date().toISOString(),
  });

  console.log(`\nUpdated .env.local:`);
  console.log(`  SEAT_VAULT_ADDRESS=${address}`);
  console.log(`  NEXT_PUBLIC_SEAT_VAULT_ADDRESS=${address}`);
  console.log(`\nRecorded deployment v${version} in contracts/deployments/`);
  if (broadcast?.txHash) {
    console.log(`Create tx: ${broadcast.txHash}`);
  }
  console.log(`\nRequired follow-ups (owner; before Gate 2):`);
  console.log(`  1. On escrow ${escrowAddress}: setSeatVault(${address})`);
  console.log(`  2. setPauser(<cold pauser>) on escrow and SeatVault`);
  console.log(`  3. transferOwnership → acceptOwnership to admin (both)`);
  console.log(`  4. pnpm verify:seat-vault`);
  console.log(`BaseScan: https://sepolia.basescan.org/address/${address}`);
}

main();
