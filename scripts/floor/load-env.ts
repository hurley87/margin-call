/**
 * Load Floor-related keys from .env.local into process.env when unset.
 * Shell exports always win. Does not throw if .env.local is absent.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const ENV_LOCAL = join(ROOT, ".env.local");

const FLOOR_ENV_KEYS = [
  "ROBINHOOD_TESTNET_RPC_URL",
  "FLOOR_PROOF_PRIVATE_KEY",
  "FLOOR_SPONSORSHIP_MODE",
  "NEXT_PUBLIC_PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "OPERATOR_PRIVATE_KEY",
] as const;

export function loadFloorEnvLocal(): void {
  if (!existsSync(ENV_LOCAL)) return;

  const fileEnv: Record<string, string> = {};
  for (const line of readFileSync(ENV_LOCAL, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    fileEnv[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }

  for (const key of FLOOR_ENV_KEYS) {
    const fromShell = process.env[key];
    if (fromShell !== undefined && fromShell !== "") continue;
    const fromFile = fileEnv[key];
    if (fromFile !== undefined && fromFile !== "") {
      process.env[key] = fromFile;
    }
  }
}
