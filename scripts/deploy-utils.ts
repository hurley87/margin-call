/** Framework-neutral helpers for future Foundry deploy scripts. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "..");
export const ENV_LOCAL = join(ROOT, ".env.local");
export const CONTRACTS_DIR = join(ROOT, "contracts");
export const DEPLOYMENTS_DIR = join(CONTRACTS_DIR, "deployments");

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function loadEnvLocal(): Record<string, string> {
  if (!existsSync(ENV_LOCAL)) {
    throw new Error(".env.local not found — copy .env.example first");
  }

  const env: Record<string, string> = {};
  for (const line of readFileSync(ENV_LOCAL, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    env[trimmed.slice(0, separator).trim()] = trimmed
      .slice(separator + 1)
      .trim();
  }
  return env;
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

export function readLatestBroadcastCreate(opts: {
  scriptFileName: string;
  chainId: number;
}): BroadcastCreate | null {
  const latestPath = join(
    CONTRACTS_DIR,
    "broadcast",
    opts.scriptFileName,
    String(opts.chainId),
    "run-latest.json"
  );
  if (!existsSync(latestPath)) return null;

  const data = JSON.parse(readFileSync(latestPath, "utf8")) as BroadcastFile;
  const create = data.transactions?.find(
    (tx) => tx.transactionType === "CREATE" && tx.contractAddress !== undefined
  );
  if (!create?.contractAddress) return null;

  const receipt = data.receipts?.find(
    (candidate) =>
      candidate.transactionHash &&
      create.hash &&
      candidate.transactionHash.toLowerCase() === create.hash.toLowerCase()
  );
  const rawBlock = receipt?.blockNumber;
  const blockNumber =
    typeof rawBlock === "string"
      ? Number.parseInt(rawBlock, rawBlock.startsWith("0x") ? 16 : 10)
      : rawBlock;

  return {
    contractAddress: create.contractAddress,
    txHash: create.hash ?? receipt?.transactionHash,
    blockNumber,
  };
}

export function runForgeDeploy(opts: {
  scriptTarget: string;
  rpcUrl: string;
  privateKey: string;
  addressLabel: string;
  env?: Record<string, string>;
  gasEstimateMultiplier?: number;
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
      "--gas-estimate-multiplier",
      String(opts.gasEstimateMultiplier ?? 130),
      "-vv",
    ],
    {
      cwd: CONTRACTS_DIR,
      env: { ...process.env, ...opts.env },
      encoding: "utf8",
    }
  );

  const match = output.match(
    new RegExp(`${opts.addressLabel} deployed at:\\s*(0x[a-fA-F0-9]{40})`)
  );
  if (!match?.[1]) {
    throw new Error("Could not parse deployed address from forge output");
  }
  return { address: match[1], output };
}

export function patchEnvLocal(key: string, value: string) {
  const current = readFileSync(ENV_LOCAL, "utf8");
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const next = pattern.test(current)
    ? current.replace(pattern, line)
    : `${current.trimEnd()}\n${line}\n`;
  writeFileSync(ENV_LOCAL, next);
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

export function enrichDeploymentRecord(
  filename: string,
  fields: { txHash?: string; blockNumber?: number; address?: string }
) {
  if (!existsSync(DEPLOYMENTS_DIR)) {
    mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  }
  const filePath = join(DEPLOYMENTS_DIR, filename);
  const existing = existsSync(filePath)
    ? (JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>)
    : {};
  const next = {
    ...existing,
    ...(fields.address ? { address: fields.address } : {}),
    ...(fields.txHash ? { txHash: fields.txHash } : {}),
    ...(fields.blockNumber !== undefined
      ? { blockNumber: fields.blockNumber }
      : {}),
    deployedAt: new Date().toISOString(),
  };
  writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}
