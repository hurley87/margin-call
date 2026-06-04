/// <reference types="vite/client" />
import { describe, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { seedActiveTrader, seedDeskManager } from "./setup";
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
 * Wire drops now emit exactly one role="main" dispatch and never a Deal Seed.
 * Arc/entity slugs must match wireSeason01.ts:
 *   arcs: "pan-atlantic-blowup", "mercer-investigation"
 *   entities: "marty-vale", "diane-mercer", "pan-atlantic-holdings", etc.
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
    ],
    dealSeed: null,
    arcUpdates: [{ arcSlug: "pan-atlantic-blowup", tensionDelta: 2 }],
    entityMentions: ["marty-vale"],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("wire/generator: idempotency on duplicate epochSlot", () => {
  it("does not insert a second row when devForceEpoch is called twice with same slot", async () => {
    const t = convexTest(schema, modules);
    await seedSeasonAndDrops(t);

    const stub = makeLlmStub();

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

    const stub = makeLlmStub();

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
    expect((row.headlines as unknown[]).length).toBe(1);
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

    const stub = makeLlmStub({
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
      _testLlmStub: makeLlmStub({
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
      _testLlmStub: makeLlmStub(),
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
      _testLlmStub: makeLlmStub(),
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

  it("suppresses the same primary arc after two consecutive successful drops for one assembly", async () => {
    const t = convexTest(schema, modules);
    await seedSeasonAndDrops(t);
    await setInitialTopTitle(t, "Mercer investigation widens");
    await setArcTension(t, "pan-atlantic-blowup", 9);

    const flatPanUpdate = [{ arcSlug: "pan-atlantic-blowup", tensionDelta: 0 }];
    // A role=main dispatch with no materialChange — only valid while the
    // pan-atlantic arc is suppressed (so it is not the post-suppression top arc).
    const noMaterialStub = makeLlmStub({
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
      ],
    });

    const r1 = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: makeLlmStub({ arcUpdates: flatPanUpdate }),
    });
    expect((r1 as { inserted?: boolean }).inserted).toBe(true);

    const r2 = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: makeLlmStub({ arcUpdates: flatPanUpdate }),
    });
    expect((r2 as { inserted?: boolean }).inserted).toBe(true);

    const r3 = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: noMaterialStub,
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
    const dmId = await seedDeskManager(t);
    const traderId = await seedActiveTrader(t, dmId);

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
        traderId,
        traderWipedOut: true,
        wipeoutReason: "margin call",
        createdAt: now,
      });
    });

    const result = await t.action(internal.wire.generator.devForceEpoch, {
      ignoreSlot: true,
      _testLlmStub: makeLlmStub(),
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
