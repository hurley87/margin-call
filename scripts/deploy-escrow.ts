/**
 * Deploy MarginCallEscrow to Base Sepolia and patch NEXT_PUBLIC_ESCROW_ADDRESS in .env.local.
 *
 * Requires in .env.local:
 *   OPERATOR_PRIVATE_KEY
 *   NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL
 *
 * Usage: pnpm deploy:escrow
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = join(import.meta.dirname, "..");
const ENV_LOCAL = join(ROOT, ".env.local");

function loadEnvLocal(): Record<string, string> {
  if (!existsSync(ENV_LOCAL)) {
    throw new Error(
      ".env.local not found — copy .env.example and set OPERATOR_PRIVATE_KEY"
    );
  }
  const lines = readFileSync(ENV_LOCAL, "utf8").split("\n");
  const env: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

function patchEnvLocal(key: string, value: string) {
  let content = readFileSync(ENV_LOCAL, "utf8");
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(content)) {
    content = content.replace(pattern, line);
  } else {
    content = content.trimEnd() + `\n${line}\n`;
  }
  writeFileSync(ENV_LOCAL, content);
}

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

  console.log(`Deploying MarginCallEscrow with operator ${operatorAddress}…`);

  const output = execSync(
    `forge script script/DeployMarginCallEscrow.s.sol:DeployMarginCallEscrow --rpc-url "${rpcUrl}" --private-key "${operatorKey}" --broadcast -vv`,
    {
      cwd: join(ROOT, "contracts"),
      env: {
        ...process.env,
        OPERATOR_ADDRESS: operatorAddress,
      },
      encoding: "utf8",
    }
  );

  console.log(output);

  const match = output.match(
    /MarginCallEscrow deployed at:\s*(0x[a-fA-F0-9]{40})/
  );
  if (!match) {
    throw new Error("Could not parse deployed address from forge output");
  }
  const address = match[1] as string;
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
