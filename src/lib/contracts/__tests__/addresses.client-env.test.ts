import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourcePath = fileURLToPath(new URL("../addresses.ts", import.meta.url));
const source = readFileSync(sourcePath, "utf8");

const publicAddressKeys = [
  "NEXT_PUBLIC_MOCKUSD_ADDRESS",
  "NEXT_PUBLIC_PACKCUSTODY_ADDRESS",
  "NEXT_PUBLIC_ASSETREGISTRY_ADDRESS",
  "NEXT_PUBLIC_RIPENGINE_ADDRESS",
  "NEXT_PUBLIC_GAMETOKEN_ADDRESS",
  "NEXT_PUBLIC_DISTRIBUTOR_ADDRESS",
] as const;

describe("contract address client environment access", () => {
  it("uses statically analyzable NEXT_PUBLIC address references", () => {
    for (const envKey of publicAddressKeys) {
      expect(source).toContain(`process.env.${envKey}`);
    }
  });

  it("does not use dynamic environment lookup in the client address module", () => {
    expect(source).not.toMatch(/process\.env\s*\[/);
  });
});
