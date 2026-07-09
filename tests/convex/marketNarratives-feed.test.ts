/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";

const modules = import.meta.glob("../../convex/**/*.ts");

// Wire drops carry a single role="main" dispatch and no Deal Seeds, so feedDrops
// should never attach dealSeed metadata and should surface the tweet variant.
describe("marketNarratives.feedDrops", () => {
  it("returns drops without dealSeed and with the tweet variant", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seasons.importSeason, {});

    const seasonId = await t.run(async (ctx) => {
      const s = await ctx.db.query("narrativeSeasons").first();
      return s!._id;
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("marketNarratives", {
        epoch: 1,
        seasonId,
        epochSlot: 1,
        dropTitle: "QUIET TAPE",
        topArcTitle: "Quiet tape",
        topArcTension: 0,
        headlines: [
          {
            headline: "Nothing much happened and the desk approves",
            body: "A slow session. The interns went home early.",
            category: "wire",
            role: "main",
            dispatchKey: "quiet-1",
          },
        ],
        worldState: { mood: "bored" },
        rawNarrative: "Nothing much happened and the desk approves",
        tweetVariant: "Slow tape today. The desk approves. $KUPO",
        tweetStatus: "dry_run",
        createdAt: Date.now(),
      });
    });

    const drops = await t.query(api.marketNarratives.feedDrops, { limit: 5 });
    expect(drops.length).toBe(1);
    expect(drops[0].tweetVariant).toContain("Slow tape");
    for (const d of drops[0].dispatches) {
      expect(d.dealSeed).toBeUndefined();
    }
  });
});
