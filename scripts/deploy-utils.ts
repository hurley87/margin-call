/**
 * Shared helpers for Foundry deploy and verify scripts (Robinhood Chain testnet).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "..");
export const ENV_LOCAL = join(ROOT, ".env.local");
export const CONTRACTS_DIR = join(ROOT, "contracts");
export const DEPLOYMENTS_DIR = join(CONTRACTS_DIR, "deployments");

export const ROBINHOOD_TESTNET_CHAIN_ID = 46_630;
export const ROBINHOOD_TESTNET_EXPLORER =
  "https://explorer.testnet.chain.robinhood.com";
export const ROBINHOOD_TESTNET_VERIFIER_URL =
  "https://explorer.testnet.chain.robinhood.com/api/";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function loadEnvLocal(): Record<string, string> {
  if (!existsSync(ENV_LOCAL)) {
    throw new Error(
      ".env.local not found — copy .env.example and set DEPLOYER_PRIVATE_KEY / ROBINHOOD_TESTNET_RPC_URL"
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
  for (const key of [
    "DEPLOYER_PRIVATE_KEY",
    "OPERATOR_PRIVATE_KEY",
    "ROBINHOOD_TESTNET_RPC_URL",
    "NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL",
    "MOCKUSD_ADMIN",
    "MOCKUSD_MINTER",
    "MOCKUSD_ADDRESS",
    "NEXT_PUBLIC_MOCKUSD_ADDRESS",
    "PACKCUSTODY_ADMIN",
    "PACKCUSTODY_WHITELIST_ADMIN",
    "PACKCUSTODY_WHITELIST",
    "PACKCUSTODY_ADDRESS",
    "NEXT_PUBLIC_PACKCUSTODY_ADDRESS",
    "ASSETREGISTRY_ADMIN",
    "ASSETREGISTRY_INVENTORY",
    "ASSETREGISTRY_STALE_AFTER",
    "ASSETREGISTRY_SEED_FEEDS",
    "ASSETREGISTRY_ADDRESS",
    "NEXT_PUBLIC_ASSETREGISTRY_ADDRESS",
    "ETHERSCAN_API_KEY",
  ]) {
    const value = process.env[key];
    if (value !== undefined && value !== "") {
      env[key] = value;
    }
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

/**
 * Read the latest forge `--broadcast` artifact for a script.
 */
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
 * Run a Foundry deploy script and return the deployed address parsed from its
 * output. Uses execFileSync with an argv array so the private key is never
 * interpolated into a shell-parsed command string.
 */
/**
 * Robinhood Chain charges L1 calldata as extra gas, and for a contract deployment that
 * component dominates the estimate and moves with the L1 base fee between estimation and
 * execution. Forge's default 130% headroom is not enough: PackCustody's first attempt
 * consumed its whole limit (4.1M of 4.4M gas was the L1 component) and reverted out of gas.
 * Only gas actually used is billed, so a generous ceiling costs nothing.
 */
const GAS_ESTIMATE_MULTIPLIER = 400;

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
      String(opts.gasEstimateMultiplier ?? GAS_ESTIMATE_MULTIPLIER),
      "-vv",
    ],
    {
      cwd: CONTRACTS_DIR,
      env: {
        ...process.env,
        ...opts.env,
      },
      encoding: "utf8",
    }
  );
  console.log(output);

  const match = output.match(
    new RegExp(`${opts.addressLabel} deployed at:\\s*(0x[a-fA-F0-9]{40})`)
  );
  if (!match?.[1]) {
    throw new Error("Could not parse deployed address from forge output");
  }
  return { address: match[1], output };
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

export function castAbiEncode(signature: string, args: string[]): string {
  const encoded = execFileSync("cast", ["abi-encode", signature, ...args], {
    encoding: "utf8",
  }).trim();
  if (!encoded.startsWith("0x")) {
    throw new Error(`cast abi-encode failed: ${encoded}`);
  }
  return encoded;
}

export function runForgeVerifyBlockscout(opts: {
  address: string;
  contractPath: string;
  constructorArgsHex: string;
  chainId?: number;
}): string {
  const chainId = opts.chainId ?? ROBINHOOD_TESTNET_CHAIN_ID;
  return execFileSync(
    "forge",
    [
      "verify-contract",
      opts.address,
      opts.contractPath,
      "--chain-id",
      String(chainId),
      "--watch",
      "--verifier",
      "blockscout",
      "--verifier-url",
      ROBINHOOD_TESTNET_VERIFIER_URL,
      "--constructor-args",
      opts.constructorArgsHex,
    ],
    {
      cwd: CONTRACTS_DIR,
      encoding: "utf8",
    }
  );
}

/**
 * Merge txHash (and optional blockNumber) from the forge broadcast artifact into
 * an existing deployment JSON written by the Solidity script.
 */
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
