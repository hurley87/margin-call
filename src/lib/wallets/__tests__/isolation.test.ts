import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")
      ? [full]
      : [];
  });
}

describe("wallet-agnostic agent surface", () => {
  it("does not import Dynamic server wallets or the wallet adapter", () => {
    const roots = [
      path.resolve(__dirname, "../../agent"),
      path.resolve(__dirname, "../../../app/api/agent"),
      path.resolve(__dirname, "../../../app/api/mcp"),
    ];
    const files = roots.flatMap(walk);
    expect(files.length).toBeGreaterThan(0);

    const forbidden =
      /@\/lib\/wallets|@dynamic-labs-wallet|createDynamicAgentWallet|provisionOrResolveDynamicWallet|@\/lib\/uniswap\/trading-api|acquireSupportedStock/;

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(forbidden);
    }
  });
});
