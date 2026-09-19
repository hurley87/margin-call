import { writeFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadLocalEnv } from "@/lib/wallets/load-env";

describe("loadLocalEnv", () => {
  const dirs: string[] = [];
  const previous = new Map<string, string | undefined>();

  afterEach(async () => {
    for (const key of previous.keys()) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    previous.clear();
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true }))
    );
  });

  function track(key: string) {
    if (!previous.has(key)) previous.set(key, process.env[key]);
  }

  it("fills missing keys from .env.local without overwriting", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mc-env-"));
    dirs.push(dir);
    await writeFile(
      path.join(dir, ".env.local"),
      "DYNAMIC_API_TOKEN=from-file\nDYNAMIC_WALLET_PASSWORD=from-file\n"
    );

    track("DYNAMIC_API_TOKEN");
    track("DYNAMIC_WALLET_PASSWORD");
    process.env.DYNAMIC_API_TOKEN = "already-set";
    delete process.env.DYNAMIC_WALLET_PASSWORD;

    await loadLocalEnv({ cwd: dir });

    expect(process.env.DYNAMIC_API_TOKEN).toBe("already-set");
    expect(process.env.DYNAMIC_WALLET_PASSWORD).toBe("from-file");
  });
});
