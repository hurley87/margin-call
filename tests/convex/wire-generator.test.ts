/// <reference types="vite/client" />
import { describe, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { GameEventCtx } from "../../convex/wire/epochAssembler";

const modules = import.meta.glob("../../convex/**/*.ts");

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function seedSeasonAndDrops(t: ReturnType<typeof convexTest>) {
  return t.mutation(api.seasons.importSeason, {});
}

async function setInitialTopTitle(
  t: ReturnType<typeof convexTest>,
  topArcTitle: string
) {
  await t.run(async (ctx) => {
    const seedDrop = await ctx.db
      .query("marketNarratives")
      .withIndex("byEpochSlot", (q) => q.eq("epochSlot", 0))
      .first();
    if (seedDrop) {
      await ctx.db.patch(seedDrop._id, { topArcTitle });
    }
  });
}

async function setArcTension(
  t: ReturnType<typeof convexTest>,
  slug: string,
  tensionScore: number
) {
  await t.run(async (ctx) => {
    const arcs = await ctx.db.query("narrativeArcs").collect();
    const arc = arcs.find((candidate) => candidate.slug === slug);
    if (arc) {
      await ctx.db.patch(arc._id, { tensionScore });
    }
  });
}

/** A minimal valid LLM stub response for the wire generator.
 * Arc/entity slugs must match wireSeason01.ts:
 * arcs: "pan-atlantic-blowup", "mercer-investigation"
 * entities: "marty-vale", "diane-mercer", "pan-atlantic-holdings", etc.
 */
function makeLlmStub(overrides: Record<string, unknown> = {}) {
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
        body: "Trading desk confirms three consecutive missed settlements. Phones ringing.",
        category: "market",
        role: "main",
        arcSlug: "pan-atlantic-blowup",
        referenceEpoch: null,
        materialChange: {
          kind: "asset_loss",
          entitySlug: "pan-atlantic-holdings",
          magnitude: { label: "settlement miss" },
        },
      },
      {
        dispatchKey: "supp-vale-sec",
        headline: "Marty Vale spotted outside SEC building",
        body: "No comment from his office. His assistant hung up.",
        category: "floor_talk",
        role: "supporting",
        arcSlug: "mercer-investigation",
        referenceEpoch: null,
      },
    ],
    dealSeed: null,
    arcUpdates: [{ arcSlug: "pan-atlantic-blowup", tensionDelta: 2 }],
    entityMentions: ["marty-vale"],
    ...overrides,
  };
}

function makeLlmStubWithSeed(overrides: Record<string, unknown> = {}) {
  return makeLlmStub({
    dispatches: [
      {
        dispatchKey: "main-panatl-halt",
        headline: "PanAtlantic bonds halted at the exchange",
        body: "Trading desk confirms three consecutive missed settlements. Phones ringing.",
        category: "market",
        role: "main",
        arcSlug: "pan-atlantic-blowup",
        referenceEpoch: null,
        materialChange: {
          kind: "asset_loss",
          entitySlug: "pan-atlantic-holdings",
          magnitude: { label: "settlement miss" },
        },
      },
      {
        dispatchKey: "seed-rourke-short",
        headline: "Rourke seen building short against PanAtl. bond block",
        body: "Three orders crossed before lunch. Counterparty unconfirmed.",
        category: "deal_seed",
        role: "deal_seed",
        arcSlug: "pan-atlantic-blowup",
        referenceEpoch: null,
      },
    ],
    dealSeed: {
      dispatchKey: "seed-rourke-short",
      arcSlug: "pan-atlantic-blowup",
      prompt:
        "Rourke is shorting PanAtl. paper before the margin notice hits the tape — front-run or fade.",
      suggestedPotUsdc: 10,
      suggestedEntryCostUsdc: 5,
    },
    confirmedFacts: ["PanAtlantic missed three settlements"],
    openQuestions: ["Who takes the other side of Rourke's short?"],
    ...overrides,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("wire/generator: idempotency on duplicate epochSlot", () => {
  it("does not insert a second row when devForceEpoch is called twice with same slot", async () => {
    const t = convexTest(schema, modules);
    await seedSeasonAndDrops(t);

    // Initial seed drop has no Deal Seed, so cadence requires the first
    // generator drop to include one.
    const stub = makeLlmStubWithSeed();

    // First run — force a specific slot
    const result1 = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: false,
      _testLlmStub: stub,
    });

    expect(result1).not.toHaveProperty("skipped");

    // Second run with the same slot (ignoreSlot: false uses currentEpochSlot)
    const result2 = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: false,
      _testLlmStub: stub,
    });

    expect((result2 as { skipped?: string }).skipped).toBe("duplicate-slot");

    // Only one row written
    const rows = await t.run(async (ctx) =>
      ctx.db.query("marketNarratives").collect()
    );
    // The seed creates one row (epochSlot=0) + one from the generator
    const generatedRows = rows.filter((r) => r.epochSlot !== 0);
    expect(generatedRows.length).toBe(1);
  });
});

describe("wire/generator: writes a marketNarratives row on success", () => {
  it("inserts a row with correct fields on devForceEpoch", async () => {
    const t = convexTest(schema, modules);
    await seedSeasonAndDrops(t);

    const stub = makeLlmStubWithSeed();

    const result = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true, // unique slot per run
      _testLlmStub: stub,
    });

    expect((result as { inserted?: boolean }).inserted).toBe(true);

    const rows = await t.run(async (ctx) =>
      ctx.db.query("marketNarratives").collect()
    );
    const generatedRows = rows.filter((r) => r.epochSlot !== 0);
    expect(generatedRows.length).toBe(1);

    const row = generatedRows[0];
    expect(row.dropTitle).toBe("PANIC ON THE FLOOR");
    expect(row.seasonId).toBeTruthy();
    expect(row.epochSlot).toBeDefined();
    expect(Array.isArray(row.headlines)).toBe(true);
    expect((row.headlines as unknown[]).length).toBe(2);
  });

  it("applies arcUpdates to the narrative arc tensionScore", async () => {
    const t = convexTest(schema, modules);
    await seedSeasonAndDrops(t);

    // Read the initial tension for pan-atlantic-blowup arc
    const arcsBefore = await t.run(async (ctx) =>
      ctx.db.query("narrativeArcs").collect()
    );
    const arc = arcsBefore.find((a) => a.slug === "pan-atlantic-blowup");
    expect(arc).toBeDefined();
    const initialTension = arc!.tensionScore;

    const stub = makeLlmStubWithSeed({
      arcUpdates: [{ arcSlug: "pan-atlantic-blowup", tensionDelta: 2 }],
    });

    await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: stub,
    });

    const arcsAfter = await t.run(async (ctx) =>
      ctx.db.query("narrativeArcs").collect()
    );
    const arcAfter = arcsAfter.find((a) => a.slug === "pan-atlantic-blowup");
    expect(arcAfter?.tensionScore).toBe(Math.min(10, initialTension + 2));
  });

  it("persists continuity fields and arc phase when emitted", async () => {
    const t = convexTest(schema, modules);
    await seedSeasonAndDrops(t);

    const result = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: makeLlmStubWithSeed({
        confirmedFacts: ["PanAtlantic missed settlement by noon."],
        openQuestions: ["Who financed the failed PanAtlantic block?"],
        arcUpdates: [
          {
            arcSlug: "pan-atlantic-blowup",
            tensionDelta: 1,
            phase: "panic",
          },
        ],
      }),
    });

    expect((result as { inserted?: boolean }).inserted).toBe(true);

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("marketNarratives")
        .withIndex("byEpoch")
        .order("desc")
        .first()
    );
    expect(row?.confirmedFacts).toEqual([
      "PanAtlantic missed settlement by noon.",
    ]);
    expect(row?.openQuestions).toEqual([
      "Who financed the failed PanAtlantic block?",
    ]);

    const arcs = await t.run(async (ctx) =>
      ctx.db.query("narrativeArcs").collect()
    );
    expect(arcs.find((a) => a.slug === "pan-atlantic-blowup")?.phase).toBe(
      "panic"
    );
  });
});

describe("wire/generator: primary arc rotation", () => {
  it("suppresses a repeated primary arc for one generated drop, then lets it return", async () => {
    const t = convexTest(schema, modules);
    await seedSeasonAndDrops(t);

    const first = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: makeLlmStubWithSeed(),
    });
    expect((first as { inserted?: boolean }).inserted).toBe(true);

    const suppressed = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: makeLlmStub(),
    });
    expect((suppressed as { inserted?: boolean }).inserted).toBe(true);

    const rowsAfterSuppression = await t.run(async (ctx) =>
      ctx.db
        .query("marketNarratives")
        .withIndex("byEpoch")
        .order("desc")
        .take(2)
    );
    expect(rowsAfterSuppression[0].topArcTitle).toBe(
      "Mercer investigation widens"
    );

    const returned = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: makeLlmStubWithSeed(),
    });
    expect((returned as { inserted?: boolean }).inserted).toBe(true);

    const rowsAfterReturn = await t.run(async (ctx) =>
      ctx.db
        .query("marketNarratives")
        .withIndex("byEpoch")
        .order("desc")
        .take(1)
    );
    expect(rowsAfterReturn[0].topArcTitle).toBe("PanAtlantic blow-up");
  });
});

describe("wire/generator: no-op outside trading hours (via generateNextEpoch)", () => {
  it("generateNextEpoch skips without writing when called on a weekend", async () => {
    // Pin clock to Saturday 2026-05-09 14:00 UTC — guaranteed outside ET trading hours
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-09T14:00:00.000Z"));

    try {
      const t = convexTest(schema, modules);
      await seedSeasonAndDrops(t);

      const result = await t.action(
        internal.wire.generator.generateNextEpoch,
        {}
      );

      expect(result).toMatchObject({ skipped: "outside-market-hours" });

      // No rows written
      const rows = await t.run(async (ctx) =>
        ctx.db.query("marketNarratives").collect()
      );
      const generatedRows = rows.filter((r) => r.epochSlot !== 0);
      expect(generatedRows.length).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("wire/generator: validation rejection", () => {
  it("does not write a row when the LLM stub fails validation (off-roster entity)", async () => {
    const t = convexTest(schema, modules);
    await seedSeasonAndDrops(t);

    const badStub = makeLlmStub({
      entityMentions: ["ghost-trader-not-on-roster"],
    });

    const result = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: badStub,
    });

    expect((result as { skipped?: string }).skipped).toBe("validation-failed");

    // No new rows written
    const rows = await t.run(async (ctx) =>
      ctx.db.query("marketNarratives").collect()
    );
    const generatedRows = rows.filter((r) => r.epochSlot !== 0);
    expect(generatedRows.length).toBe(0);
  });

  it("does not write a row when the LLM stub has an unknown arcSlug", async () => {
    const t = convexTest(schema, modules);
    await seedSeasonAndDrops(t);

    const badStub = makeLlmStub({
      dispatches: [
        {
          dispatchKey: "main-mystery",
          headline: "Mystery arc dispatch here",
          body: "This arc does not exist in the season.",
          category: "market",
          role: "main",
          arcSlug: "nonexistent-arc-xyz",
          referenceEpoch: null,
        },
        {
          dispatchKey: "supp-pad",
          headline: "Second dispatch for count",
          body: "Padding dispatch body here.",
          category: "market",
          role: "supporting",
          arcSlug: "pan-atlantic-blowup",
          referenceEpoch: null,
        },
      ],
    });

    const result = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: badStub,
    });

    expect((result as { skipped?: string }).skipped).toBe("validation-failed");
  });
});

describe("wire/generator: activity ingestion — wipeout captured in eventsIngested", () => {
  it("includes a dramatic wipeout event in eventsIngested when a dealOutcome exists", async () => {
    const t = convexTest(schema, modules);
    await seedSeasonAndDrops(t);

    // Seed a deal and a wipeout outcome created just now
    await t.run(async (ctx) => {
      const now = Date.now();
      const dealId = await ctx.db.insert("deals", {
        prompt: "Short the whole market",
        potUsdc: 500,
        entryCostUsdc: 50,
        status: "open",
        creatorType: "desk_manager",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("dealOutcomes", {
        dealId,
        traderId: "trader-stub-123",
        traderWipedOut: true,
        wipeoutReason: "margin call",
        createdAt: now,
      });
    });

    // Cadence requires a seeded stub for the first generator drop after import.
    const stub = makeLlmStubWithSeed();

    const result = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: stub,
    });

    expect((result as { inserted?: boolean }).inserted).toBe(true);

    const rows = await t.run(async (ctx) =>
      ctx.db.query("marketNarratives").collect()
    );
    const row = rows.find((r) => r.epochSlot !== 0);
    expect(row).toBeDefined();

    const events = row!.eventsIngested as GameEventCtx[] | null | undefined;
    expect(events).toBeDefined();
    expect(Array.isArray(events)).toBe(true);

    const wipeout = (events as GameEventCtx[]).find(
      (e) => e.type === "wipeout"
    );
    expect(wipeout).toBeDefined();
    expect(wipeout!.dramatic).toBe(true);
  });
});

describe("wire/generator: deal seeds — persistence + cadence", () => {
  it("persists a wireDealSeeds row when the LLM stub includes a dealSeed", async () => {
    const t = convexTest(schema, modules);
    await seedSeasonAndDrops(t);

    const stub = makeLlmStubWithSeed();

    const result = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: stub,
    });
    expect((result as { inserted?: boolean }).inserted).toBe(true);

    const seeds = await t.run(async (ctx) =>
      ctx.db.query("wireDealSeeds").collect()
    );
    expect(seeds.length).toBe(1);
    const seed = seeds[0];
    expect(seed.dispatchKey).toBe("seed-rourke-short");
    expect(seed.dispatchHeadline).toContain("Rourke");
    expect(seed.suggestedPotUsdc).toBe(10);
    expect(seed.suggestedEntryCostUsdc).toBe(5);
    expect(seed.dispatchIndex).toBe(1);
    expect(seed.epochId).toEqual((result as { dropId: unknown }).dropId);
  });

  it("rejects a second consecutive drop with no dealSeed (cadence)", async () => {
    const t = convexTest(schema, modules);
    await seedSeasonAndDrops(t);

    // Drop 1: with seed (seed-imported initial drop has no seed, so cadence requires one).
    const r1 = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: makeLlmStubWithSeed(),
    });
    expect((r1 as { inserted?: boolean }).inserted).toBe(true);

    // Drop 2: no seed — cadence satisfied because previous drop had a seed.
    const r2 = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: makeLlmStub(),
    });
    expect((r2 as { inserted?: boolean }).inserted).toBe(true);

    // Drop 3: also no seed — second consecutive no-seed drop, must be rejected.
    const r3 = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: makeLlmStub(),
    });
    expect((r3 as { skipped?: string }).skipped).toBe("validation-failed");

    // Only two generator-produced drops persisted; only the first carries a seed.
    const rows = await t.run(async (ctx) =>
      ctx.db.query("marketNarratives").collect()
    );
    const generated = rows.filter((r) => r.epochSlot !== 0);
    expect(generated.length).toBe(2);
    const seeds = await t.run(async (ctx) =>
      ctx.db.query("wireDealSeeds").collect()
    );
    expect(seeds.length).toBe(1);
  });

  it("accepts a no-seed drop immediately after a seeded drop (cadence satisfied)", async () => {
    const t = convexTest(schema, modules);
    await seedSeasonAndDrops(t);

    const r1 = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: makeLlmStubWithSeed(),
    });
    expect((r1 as { inserted?: boolean }).inserted).toBe(true);

    const r2 = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: makeLlmStub(),
    });
    expect((r2 as { inserted?: boolean }).inserted).toBe(true);
  });

  it("rejects a dealSeed pointing at an off-roster arcSlug", async () => {
    const t = convexTest(schema, modules);
    await seedSeasonAndDrops(t);

    const badStub = makeLlmStubWithSeed({
      dealSeed: {
        dispatchKey: "seed-rourke-short",
        arcSlug: "arc-ghost",
        prompt: "Off-roster arc seed prompt for testing the rejection path.",
        suggestedPotUsdc: 10,
        suggestedEntryCostUsdc: 5,
      },
    });

    const result = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: badStub,
    });

    expect((result as { skipped?: string }).skipped).toBe("validation-failed");
  });

  it("repairs a mismatched dealSeed.dispatchKey when one deal_seed dispatch exists", async () => {
    const t = convexTest(schema, modules);
    await seedSeasonAndDrops(t);

    const result = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: makeLlmStubWithSeed({
        dealSeed: {
          dispatchKey: "panatl-short-squeeze",
          arcSlug: "pan-atlantic-blowup",
          prompt:
            "Rourke is shorting PanAtl. paper before the margin notice hits the tape — front-run or fade.",
          suggestedPotUsdc: 10,
          suggestedEntryCostUsdc: 5,
        },
      }),
    });

    expect((result as { inserted?: boolean }).inserted).toBe(true);

    const seeds = await t.run(async (ctx) =>
      ctx.db.query("wireDealSeeds").collect()
    );
    expect(seeds.length).toBe(1);
    expect(seeds[0].dispatchKey).toBe("seed-rourke-short");
    expect(seeds[0].dispatchIndex).toBe(1);
  });

  it("repairs a dealSeed.dispatchKey that points at a main dispatch when one deal_seed dispatch exists", async () => {
    const t = convexTest(schema, modules);
    await seedSeasonAndDrops(t);

    const result = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: makeLlmStubWithSeed({
        dealSeed: {
          dispatchKey: "main-panatl-halt",
          arcSlug: "pan-atlantic-blowup",
          prompt:
            "Rourke is shorting PanAtl. paper before the margin notice hits the tape — front-run or fade.",
          suggestedPotUsdc: 10,
          suggestedEntryCostUsdc: 5,
        },
      }),
    });

    expect((result as { inserted?: boolean }).inserted).toBe(true);

    const seeds = await t.run(async (ctx) =>
      ctx.db.query("wireDealSeeds").collect()
    );
    expect(seeds.length).toBe(1);
    expect(seeds[0].dispatchKey).toBe("seed-rourke-short");
    expect(seeds[0].dispatchIndex).toBe(1);
  });

  it("repairs a mismatched dealSeed.dispatchKey when the lone deal_seed dispatch has different arc metadata", async () => {
    const t = convexTest(schema, modules);
    await seedSeasonAndDrops(t);

    const result = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: makeLlmStubWithSeed({
        dispatches: [
          {
            dispatchKey: "main-panatl-halt",
            headline: "PanAtlantic bonds halted at the exchange",
            body: "Trading desk confirms three consecutive missed settlements. Phones ringing.",
            category: "market",
            role: "main",
            arcSlug: "pan-atlantic-blowup",
            referenceEpoch: null,
            materialChange: {
              kind: "asset_loss",
              entitySlug: "pan-atlantic-holdings",
              magnitude: { label: "settlement miss" },
            },
          },
          {
            dispatchKey: "seed-rourke-short",
            headline: "Rourke seen building short against PanAtl. bond block",
            body: "Three orders crossed before lunch. Counterparty unconfirmed.",
            category: "deal_seed",
            role: "deal_seed",
            arcSlug: "mercer-investigation",
            referenceEpoch: null,
          },
        ],
        dealSeed: {
          dispatchKey: "deal-panatl-fallout",
          arcSlug: "pan-atlantic-blowup",
          prompt:
            "Rourke is shorting PanAtl. paper before the margin notice hits the tape — front-run or fade.",
          suggestedPotUsdc: 10,
          suggestedEntryCostUsdc: 5,
        },
      }),
    });

    expect((result as { inserted?: boolean }).inserted).toBe(true);

    const seeds = await t.run(async (ctx) =>
      ctx.db.query("wireDealSeeds").collect()
    );
    expect(seeds.length).toBe(1);
    expect(seeds[0].dispatchKey).toBe("seed-rourke-short");
    expect(seeds[0].dispatchIndex).toBe(1);
  });

  it("repairs a mismatched dealSeed.dispatchKey when one dispatch only has deal_seed category", async () => {
    const t = convexTest(schema, modules);
    await seedSeasonAndDrops(t);

    const result = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: makeLlmStubWithSeed({
        dispatches: [
          {
            dispatchKey: "main-panatl-halt",
            headline: "PanAtlantic bonds halted at the exchange",
            body: "Trading desk confirms three consecutive missed settlements. Phones ringing.",
            category: "market",
            role: "main",
            arcSlug: "pan-atlantic-blowup",
            referenceEpoch: null,
            materialChange: {
              kind: "asset_loss",
              entitySlug: "pan-atlantic-holdings",
              magnitude: { label: "settlement miss" },
            },
          },
          {
            dispatchKey: "seed-rourke-short",
            headline: "Rourke seen building short against PanAtl. bond block",
            body: "Three orders crossed before lunch. Counterparty unconfirmed.",
            category: "deal_seed",
            role: "supporting",
            arcSlug: "pan-atlantic-blowup",
            referenceEpoch: null,
          },
        ],
        dealSeed: {
          dispatchKey: "short-position-opportunity",
          arcSlug: "pan-atlantic-blowup",
          prompt:
            "Rourke is shorting PanAtl. paper before the margin notice hits the tape — front-run or fade.",
          suggestedPotUsdc: 10,
          suggestedEntryCostUsdc: 5,
        },
      }),
    });

    expect((result as { inserted?: boolean }).inserted).toBe(true);

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("marketNarratives")
        .withIndex("byEpoch")
        .order("desc")
        .take(1)
    );
    expect(rows[0].headlines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dispatchKey: "seed-rourke-short",
          category: "deal_seed",
          role: "deal_seed",
        }),
      ])
    );

    const seeds = await t.run(async (ctx) =>
      ctx.db.query("wireDealSeeds").collect()
    );
    expect(seeds.length).toBe(1);
    expect(seeds[0].dispatchKey).toBe("seed-rourke-short");
    expect(seeds[0].dispatchIndex).toBe(1);
  });

  it("repairs a mismatched dealSeed.dispatchKey when one non-main dispatch can source the seed", async () => {
    const t = convexTest(schema, modules);
    await seedSeasonAndDrops(t);

    const result = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: makeLlmStubWithSeed({
        dispatches: [
          {
            dispatchKey: "main-panatl-halt",
            headline: "PanAtlantic bonds halted at the exchange",
            body: "Trading desk confirms three consecutive missed settlements. Phones ringing.",
            category: "wire",
            role: "main",
            arcSlug: "pan-atlantic-blowup",
            referenceEpoch: null,
            materialChange: {
              kind: "asset_loss",
              entitySlug: "pan-atlantic-holdings",
              magnitude: { label: "settlement miss" },
            },
          },
          {
            dispatchKey: "quick-entry-wire",
            headline: "Rourke desk offers fast PanAtlantic entry",
            body: "The price is moving while the street waits for the margin notice.",
            category: "positioning",
            role: "supporting",
            arcSlug: "pan-atlantic-blowup",
            referenceEpoch: null,
          },
        ],
        dealSeed: {
          dispatchKey: "panatl-quick-entry",
          arcSlug: "pan-atlantic-blowup",
          prompt:
            "Rourke is shorting PanAtl. paper before the margin notice hits the tape — front-run or fade.",
          suggestedPotUsdc: 10,
          suggestedEntryCostUsdc: 5,
        },
      }),
    });

    expect((result as { inserted?: boolean }).inserted).toBe(true);

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("marketNarratives")
        .withIndex("byEpoch")
        .order("desc")
        .take(1)
    );
    expect(rows[0].headlines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dispatchKey: "quick-entry-wire",
          category: "deal_seed",
          role: "deal_seed",
        }),
      ])
    );

    const seeds = await t.run(async (ctx) =>
      ctx.db.query("wireDealSeeds").collect()
    );
    expect(seeds.length).toBe(1);
    expect(seeds[0].dispatchKey).toBe("quick-entry-wire");
    expect(seeds[0].dispatchIndex).toBe(1);
  });

  it("rejects a mismatched dealSeed.dispatchKey when there is no clear repair", async () => {
    const t = convexTest(schema, modules);
    await seedSeasonAndDrops(t);

    const ambiguousStub = makeLlmStubWithSeed({
      dispatches: [
        {
          dispatchKey: "main-panatl-halt",
          headline: "PanAtlantic bonds halted at the exchange",
          body: "Trading desk confirms three consecutive missed settlements. Phones ringing.",
          category: "market",
          role: "main",
          arcSlug: "pan-atlantic-blowup",
          referenceEpoch: null,
        },
        {
          dispatchKey: "seed-rourke-short",
          headline: "Rourke seen building short against PanAtl. bond block",
          body: "Three orders crossed before lunch. Counterparty unconfirmed.",
          category: "deal_seed",
          role: "deal_seed",
          arcSlug: "pan-atlantic-blowup",
          referenceEpoch: null,
        },
        {
          dispatchKey: "seed-marty-tip",
          headline: "Marty Vale prices a rescue rumor",
          body: "The buyer name keeps changing. The spread keeps widening.",
          category: "deal_seed",
          role: "deal_seed",
          arcSlug: "pan-atlantic-blowup",
          referenceEpoch: null,
        },
      ],
      dealSeed: {
        dispatchKey: "panatl-short-squeeze",
        arcSlug: "pan-atlantic-blowup",
        prompt:
          "Rourke is shorting PanAtl. paper before the margin notice hits the tape — front-run or fade.",
        suggestedPotUsdc: 10,
        suggestedEntryCostUsdc: 5,
      },
    });

    const result = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: ambiguousStub,
    });

    expect((result as { skipped?: string }).skipped).toBe("validation-failed");
  });
});

describe("wire/generator: primary arc rotation", () => {
  it("suppresses the same primary arc after two consecutive successful drops for one assembly", async () => {
    const t = convexTest(schema, modules);
    await seedSeasonAndDrops(t);
    await setInitialTopTitle(t, "Mercer investigation widens");
    await setArcTension(t, "pan-atlantic-blowup", 9);

    const flatPanUpdate = [{ arcSlug: "pan-atlantic-blowup", tensionDelta: 0 }];
    const noMaterialSeededStub = makeLlmStubWithSeed({
      arcUpdates: flatPanUpdate,
      dispatches: [
        {
          dispatchKey: "main-panatl-halt",
          headline: "PanAtlantic bonds halted at the exchange",
          body: "Trading desk confirms three consecutive missed settlements. Phones ringing.",
          category: "market",
          role: "main",
          arcSlug: "pan-atlantic-blowup",
          referenceEpoch: null,
        },
        {
          dispatchKey: "seed-rourke-short",
          headline: "Rourke seen building short against PanAtl. bond block",
          body: "Three orders crossed before lunch. Counterparty unconfirmed.",
          category: "deal_seed",
          role: "deal_seed",
          arcSlug: "pan-atlantic-blowup",
          referenceEpoch: null,
        },
      ],
    });

    const r1 = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: makeLlmStubWithSeed({ arcUpdates: flatPanUpdate }),
    });
    expect((r1 as { inserted?: boolean }).inserted).toBe(true);

    const r2 = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: makeLlmStub({ arcUpdates: flatPanUpdate }),
    });
    expect((r2 as { inserted?: boolean }).inserted).toBe(true);

    const r3 = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: noMaterialSeededStub,
    });
    expect((r3 as { inserted?: boolean }).inserted).toBe(true);

    const latestAfterSuppression = await t.run(async (ctx) =>
      ctx.db
        .query("marketNarratives")
        .withIndex("byEpoch")
        .order("desc")
        .first()
    );
    expect(latestAfterSuppression?.topArcTitle).toBe(
      "Mercer investigation widens"
    );

    const r4 = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: makeLlmStub({ arcUpdates: flatPanUpdate }),
    });
    expect((r4 as { inserted?: boolean }).inserted).toBe(true);

    const latestAfterReturn = await t.run(async (ctx) =>
      ctx.db
        .query("marketNarratives")
        .withIndex("byEpoch")
        .order("desc")
        .first()
    );
    expect(latestAfterReturn?.topArcTitle).toBe("PanAtlantic blow-up");
  });
});
