/**
 * Shared helpers for Foundry deploy scripts.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "..");
export const ENV_LOCAL = join(ROOT, ".env.local");
export const CONTRACTS_DIR = join(ROOT, "contracts");
export const DEPLOYMENTS_DIR = join(CONTRACTS_DIR, "deployments");

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
