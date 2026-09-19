import { readFile } from "node:fs/promises";
import path from "node:path";

const ENV_FILES = [".env.local", ".env"] as const;

/**
 * Load dotenv-style files into `process.env` without overwriting existing
 * values and without returning file contents (secrets stay out of logs).
 */
export async function loadLocalEnv(
  options: { cwd?: string } = {}
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  for (const name of ENV_FILES) {
    let raw: string;
    try {
      raw = await readFile(path.join(cwd, name), "utf8");
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue;
      }
      throw error;
    }
    applyEnvFile(raw);
  }
}

function applyEnvFile(raw: string): void {
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = unquote(trimmed.slice(eq + 1).trim());
  }
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
