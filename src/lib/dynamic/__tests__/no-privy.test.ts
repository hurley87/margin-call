import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Privy removal regression", () => {
  it("does not keep Privy packages or former runtime entry points", () => {
    const packageJson = readFileSync(
      join(process.cwd(), "package.json"),
      "utf8"
    );
    expect(packageJson).not.toContain("@privy-io/");

    for (const relativePath of [
      "src/components/providers/privy-provider.tsx",
      "src/lib/privy/wallet.ts",
      "src/lib/privy/server.ts",
      "src/lib/convex/auth.ts",
      "convex/me.ts",
    ]) {
      expect(() =>
        readFileSync(join(process.cwd(), relativePath), "utf8")
      ).toThrow();
    }
  });
});
