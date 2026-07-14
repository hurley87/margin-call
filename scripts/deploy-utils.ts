/**
 * Shared helpers for Foundry deploy and verify scripts.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BASE_SEPOLIA_CHAIN_ID } from "../convex/lib/baseSepoliaNetwork";

export const ROOT = join(import.meta.dirname, "..");
export const ENV_LOCAL = join(ROOT, ".env.local");
export const CONTRACTS_DIR = join(ROOT, "contracts");
export const DEPLOYMENTS_DIR = join(CONTRACTS_DIR, "deployments");

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function loadEnvLocal(): Record<string, string> {
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
  // Shell exports win for a small allowlist so verify/deploy can pass
  // constructor fields without permanently mutating .env.local.
  for (const key of [
    "SETTLEMENT_OPERATOR_ADDRESS",
    "DEPOSITOR_BINDER_ADDRESS",
    "ENTRY_TIMEOUT_SECONDS",
    "ESCROW_ADDRESS",
    "NEXT_PUBLIC_ESCROW_ADDRESS",
    "SEAT_VAULT_ADDRESS",
    "NEXT_PUBLIC_SEAT_VAULT_ADDRESS",
    "MARGINCALL_TOKEN",
    "NEXT_PUBLIC_MARGINCALL_TOKEN",
    "ETHERSCAN_API_KEY",
    "BASESCAN_API_KEY",
    "MARGIN_CALL_DEPLOY_GATE1_APPROVED",
    "SEAT_THRESHOLD",
    "CORNER_THRESHOLD",
    "UNSTAKE_COOLDOWN",
  ]) {
    const value = process.env[key];
    if (value !== undefined && value !== "") {
      env[key] = value;
    }
  }
  return env;
}

export function patchEnvLocal(key: string, value: string) {
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

export function requireAddress(
  value: string | undefined,
  label: string
): `0x${string}` {
  if (!value || !ADDRESS_RE.test(value)) {
    throw new Error(`${label} must be a 0x-prefixed 20-byte address`);
  }
  return value as `0x${string}`;
}

/**
 * Hard stop unless Gate 1 is explicitly approved for this shell.
 * Set `MARGIN_CALL_DEPLOY_GATE1_APPROVED=1` only after signing
 * docs/security/base-sepolia-deploy-packet-211.md on #211.
 */
export function requireGate1Approval(env: Record<string, string>) {
  // loadEnvLocal already merges MARGIN_CALL_DEPLOY_GATE1_APPROVED from the shell.
  if (env.MARGIN_CALL_DEPLOY_GATE1_APPROVED !== "1") {
    throw new Error(
      "Gate 1 not approved — refusing broadcast. Sign docs/security/base-sepolia-deploy-packet-211.md, then set MARGIN_CALL_DEPLOY_GATE1_APPROVED=1 for this shell only (see #211)."
    );
  }
}

export type BroadcastCreate = {
  txHash?: string;
  blockNumber?: number;
  contractAddress: string;
};

type BroadcastFile = {
  transactions?: Array<{
    hash?: string;
    transactionType?: string;
    contractAddress?: string;
  }>;
  receipts?: Array<{
    transactionHash?: string;
    blockNumber?: string | number;
  }>;
};

/**
 * Read the latest forge `--broadcast` artifact for a script on Base Sepolia.
 */
export function readLatestBroadcastCreate(opts: {
  scriptFileName: string;
  chainId?: number;
}): BroadcastCreate | null {
  const chainId = opts.chainId ?? BASE_SEPOLIA_CHAIN_ID;
  const latestPath = join(
    CONTRACTS_DIR,
    "broadcast",
    opts.scriptFileName,
    String(chainId),
    "run-latest.json"
  );
  if (!existsSync(latestPath)) return null;

  const data = JSON.parse(readFileSync(latestPath, "utf8")) as BroadcastFile;
  const create = data.transactions?.find(
    (tx) => tx.transactionType === "CREATE" && tx.contractAddress !== undefined
  );
  if (!create?.contractAddress) return null;

  const receipt = data.receipts?.find(
    (r) =>
      r.transactionHash &&
      create.hash &&
      r.transactionHash.toLowerCase() === create.hash.toLowerCase()
  );

  let blockNumber: number | undefined;
  if (receipt?.blockNumber !== undefined) {
    const raw = receipt.blockNumber;
    blockNumber =
      typeof raw === "string"
        ? Number.parseInt(raw, raw.startsWith("0x") ? 16 : 10)
        : raw;
  }

  return {
    contractAddress: create.contractAddress,
    txHash: create.hash ?? receipt?.transactionHash,
    blockNumber,
  };
}

/**
 * Optional txHash/blockNumber fields to fold into a deployment record, omitting
 * whichever the broadcast artifact didn't provide.
 */
export function broadcastRecordFields(broadcast: BroadcastCreate | null): {
  txHash?: string;
  blockNumber?: number;
} {
  return {
    ...(broadcast?.txHash ? { txHash: broadcast.txHash } : {}),
    ...(broadcast?.blockNumber !== undefined
      ? { blockNumber: broadcast.blockNumber }
      : {}),
  };
}

/**
 * Run a Foundry deploy script and return the deployed address parsed from its
 * output. Uses execFileSync with an argv array so the private key is never
 * interpolated into a shell-parsed command string.
 */
export function runForgeDeploy(opts: {
  scriptTarget: string;
  rpcUrl: string;
  privateKey: string;
  addressLabel: string;
  env?: Record<string, string>;
}): { address: string; output: string } {
  const output = execFileSync(
    "forge",
    [
      "script",
      opts.scriptTarget,
      "--rpc-url",
      opts.rpcUrl,
      "--private-key",
      opts.privateKey,
      "--broadcast",
      "-vv",
    ],
    {
      cwd: CONTRACTS_DIR,
      env: { ...process.env, ...opts.env },
      encoding: "utf8",
    }
  );
  console.log(output);

  const match = output.match(
    new RegExp(`${opts.addressLabel} deployed at:\\s*(0x[a-fA-F0-9]{40})`)
  );
  if (!match) {
    throw new Error("Could not parse deployed address from forge output");
  }
  return { address: match[1] as string, output };
}

export function appendDeploymentRecord<T extends Record<string, unknown>>(
  filename: string,
  record: T
) {
  if (!existsSync(DEPLOYMENTS_DIR)) {
    mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  }
  const filePath = join(DEPLOYMENTS_DIR, filename);
  const existing = existsSync(filePath)
    ? (JSON.parse(readFileSync(filePath, "utf8")) as T[])
    : [];
  const version = existing.length + 1;
  existing.push({ version, ...record });
  writeFileSync(filePath, `${JSON.stringify(existing, null, 2)}\n`);
  return version;
}

export function castAbiEncode(signature: string, args: string[]): string {
  const encoded = execFileSync("cast", ["abi-encode", signature, ...args], {
    encoding: "utf8",
  }).trim();
  if (!encoded.startsWith("0x")) {
    throw new Error(`cast abi-encode failed: ${encoded}`);
  }
  return encoded;
}

export function runForgeVerify(opts: {
  address: string;
  contractPath: string;
  constructorArgsHex: string;
  etherscanApiKey: string;
  chainId?: number;
}): string {
  const chainId = opts.chainId ?? BASE_SEPOLIA_CHAIN_ID;
  return execFileSync(
    "forge",
    [
      "verify-contract",
      opts.address,
      opts.contractPath,
      "--chain-id",
      String(chainId),
      "--watch",
      "--constructor-args",
      opts.constructorArgsHex,
      "--etherscan-api-key",
      opts.etherscanApiKey,
    ],
    {
      cwd: CONTRACTS_DIR,
      encoding: "utf8",
    }
  );
}
