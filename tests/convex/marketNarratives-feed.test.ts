/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";

const modules = import.meta.glob("../../convex/**/*.ts");

// Wire drops no longer generate Deal Seeds (single role="main" dispatch per
// hour), so feedDrops should never attach dealSeed metadata to new drops.
describe("marketNarratives.feedDrops: deal seed surfacing", () => {
  it("does not attach dealSeed when no seed exists for the drop", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.seasons.importSeason, {});

    const drops = await t.query(api.marketNarratives.feedDrops, { limit: 5 });
    // Initial seed-imported drop has no Deal Seed
    const initial = drops[0];
    for (const d of initial.dispatches) {
      expect(d.dealSeed).toBeUndefined();
    }
  });
});
