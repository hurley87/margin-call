/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";

const modules = import.meta.glob("../../convex/**/*.ts");

function makeSeededStub() {
  return {
    dropTitle: "PANIC ON THE FLOOR",
    worldState: {
      mood: "chaotic",
      sec_heat: 8,
      sectors: null,
      active_storylines: null,
      notable_traders: null,
    },
    dispatches: [
      {
        dispatchKey: "main-panatl-halt",
        headline: "PanAtlantic bonds halted at the exchange",
        body: "Trading desk confirms three consecutive missed settlements.",
        category: "market",
        role: "main" as const,
        arcSlug: "pan-atlantic-blowup",
        referenceEpoch: null,
      },
      {
        dispatchKey: "seed-rourke-short",
        headline: "Rourke seen building short against PanAtl. bond block",
        body: "Three orders crossed before lunch. Counterparty unconfirmed.",
        category: "rumor",
        role: "deal_seed" as const,
        arcSlug: "pan-atlantic-blowup",
        referenceEpoch: null,
      },
    ],
    dealSeed: {
      dispatchKey: "seed-rourke-short",
      arcSlug: "pan-atlantic-blowup",
      prompt: "Rourke is shorting PanAtl. paper before the margin notice hits.",
      suggestedPotUsdc: 250,
      suggestedEntryCostUsdc: 10,
    },
    arcUpdates: [{ arcSlug: "pan-atlantic-blowup", tensionDelta: 1 }],
    entityMentions: ["marty-vale"],
  };
}

describe("marketNarratives.feedDrops: deal seed surfacing", () => {
  it("attaches dealSeed metadata onto the matching dispatch", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.seasons.importSeason, {});

    await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: makeSeededStub(),
    });

    const drops = await t.query(api.marketNarratives.feedDrops, { limit: 5 });
    const seededDrop = drops.find((d) => d.dropTitle === "PANIC ON THE FLOOR");
    expect(seededDrop).toBeDefined();
    expect(seededDrop!.dispatches.length).toBe(2);

    const seededDispatch = seededDrop!.dispatches.find(
      (d) => d.role === "deal_seed"
    );
    expect(seededDispatch).toBeDefined();
    expect(seededDispatch!.dealSeed).toBeDefined();
    expect(seededDispatch!.dealSeed!.suggestedPotUsdc).toBe(250);
    expect(seededDispatch!.dealSeed!.suggestedEntryCostUsdc).toBe(10);
    expect(seededDispatch!.dealSeed!.linkedDealCount).toBe(0);
    expect(seededDispatch!.dealSeed!.linkedPotTotalUsdc).toBe(0);

    // Non-seed dispatches do not get a dealSeed object
    const mainDispatch = seededDrop!.dispatches.find((d) => d.role === "main");
    expect(mainDispatch?.dealSeed).toBeUndefined();
  });

  it("aggregates linked-deal counts and total linked pot per seed", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.seasons.importSeason, {});

    await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: makeSeededStub(),
    });

    const seed = await t.run(async (ctx) =>
      ctx.db.query("wireDealSeeds").first()
    );
    expect(seed).toBeDefined();

    // Insert two deals + two link rows directly (skipping the on-chain mutation).
    await t.run(async (ctx) => {
      const now = Date.now();
      const dealA = await ctx.db.insert("deals", {
        creatorType: "desk_manager",
        prompt: "Linked deal A",
        potUsdc: 100,
        entryCostUsdc: 5,
        status: "open",
        entryCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      const dealB = await ctx.db.insert("deals", {
        creatorType: "desk_manager",
        prompt: "Linked deal B",
        potUsdc: 250,
        entryCostUsdc: 8,
        status: "open",
        entryCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("wireDealSeedLinks", {
        seedId: seed!._id,
        dealId: dealA,
        createdAt: now,
      });
      await ctx.db.insert("wireDealSeedLinks", {
        seedId: seed!._id,
        dealId: dealB,
        createdAt: now,
      });
    });

    const drops = await t.query(api.marketNarratives.feedDrops, { limit: 5 });
    const seededDrop = drops.find((d) => d.dropTitle === "PANIC ON THE FLOOR")!;
    const seededDispatch = seededDrop.dispatches.find(
      (d) => d.role === "deal_seed"
    )!;

    expect(seededDispatch.dealSeed!.linkedDealCount).toBe(2);
    expect(seededDispatch.dealSeed!.linkedPotTotalUsdc).toBe(350);
  });

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
