/**
 * Deploy MarginCallEscrow to Base Sepolia and patch escrow addresses in .env.local.
 *
 * Requires in .env.local:
 *   OPERATOR_PRIVATE_KEY          — deployer key (broadcast)
 *   NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL
 *
 * Role envs (preferred distinct; see docs/security/role-matrix.md + #211 packet):
 *   SETTLEMENT_OPERATOR_ADDRESS   — optional; defaults to deployer EOA
 *   DEPOSITOR_BINDER_ADDRESS      — optional; defaults to SETTLEMENT_OPERATOR_ADDRESS
 *   ENTRY_TIMEOUT_SECONDS         — optional; default 3600
 *
 * Gate 1 human approval required before broadcast (#211).
 *
 * Usage: pnpm deploy:escrow
 */
import { privateKeyToAccount } from "viem/accounts";
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
import {
  IDENTITY_REGISTRY_ADDRESS,
  USDC_SEPOLIA_ADDRESS,
} from "../convex/lib/baseSepoliaNetwork";

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

  const deployerAddress = privateKeyToAccount(
    operatorKey as `0x${string}`
  ).address;
  const settlementOperator = requireAddress(
    env.SETTLEMENT_OPERATOR_ADDRESS ?? deployerAddress,
    "SETTLEMENT_OPERATOR_ADDRESS"
  );
  const depositorBinder = requireAddress(
    env.DEPOSITOR_BINDER_ADDRESS ?? settlementOperator,
    "DEPOSITOR_BINDER_ADDRESS"
  );
  const entryTimeoutSeconds = env.ENTRY_TIMEOUT_SECONDS ?? "3600";

  if (
    !env.SETTLEMENT_OPERATOR_ADDRESS ||
    !env.DEPOSITOR_BINDER_ADDRESS ||
    settlementOperator.toLowerCase() === depositorBinder.toLowerCase()
  ) {
    console.warn(
      "⚠ #211 preference: set distinct SETTLEMENT_OPERATOR_ADDRESS and DEPOSITOR_BINDER_ADDRESS in .env.local (see docs/security/base-sepolia-deploy-packet-211.md)."
    );
  }

  console.log(
    `Deploying MarginCallEscrow (settlement ${settlementOperator}, binder ${depositorBinder})…`
  );

  const { address } = runForgeDeploy({
    scriptTarget: "script/DeployMarginCallEscrow.s.sol:DeployMarginCallEscrow",
    rpcUrl,
    privateKey: operatorKey,
    addressLabel: "MarginCallEscrow",
    env: {
      SETTLEMENT_OPERATOR_ADDRESS: settlementOperator,
      DEPOSITOR_BINDER_ADDRESS: depositorBinder,
      ENTRY_TIMEOUT_SECONDS: entryTimeoutSeconds,
    },
  });

  const broadcast = readLatestBroadcastCreate({
    scriptFileName: "DeployMarginCallEscrow.s.sol",
  });

  patchEnvLocal("NEXT_PUBLIC_ESCROW_ADDRESS", address);
  patchEnvLocal("ESCROW_ADDRESS", address);

  const version = appendDeploymentRecord("base-sepolia.escrows.json", {
    address,
    usdc: USDC_SEPOLIA_ADDRESS,
    identityRegistry: IDENTITY_REGISTRY_ADDRESS,
    settlementOperator,
    depositorBinder,
    entryTimeoutSeconds: Number.parseInt(entryTimeoutSeconds, 10),
    deployer: deployerAddress,
    ...broadcastRecordFields(broadcast),
    deployedAt: new Date().toISOString(),
  });

  console.log(`\nUpdated .env.local:`);
  console.log(`  NEXT_PUBLIC_ESCROW_ADDRESS=${address}`);
  console.log(`  ESCROW_ADDRESS=${address}`);
  console.log(`\nRecorded deployment v${version} in contracts/deployments/`);
  if (broadcast?.txHash) {
    console.log(`Create tx: ${broadcast.txHash}`);
  }
  console.log(`\nPost-deploy (owner) before Gate 2:`);
  console.log(`  1. setSeatVault(<new vault>) after pnpm deploy:seat-vault`);
  console.log(`  2. setPauser(<cold pauser>)`);
  console.log(`  3. transferOwnership → acceptOwnership to admin`);
  console.log(`  4. pnpm verify:escrow`);
  console.log(`\nAlso set in Convex only after Gate 2 approval:`);
  console.log(`  npx convex env set ESCROW_ADDRESS ${address}`);
  console.log(`\nBaseScan: https://sepolia.basescan.org/address/${address}`);
}

main();
