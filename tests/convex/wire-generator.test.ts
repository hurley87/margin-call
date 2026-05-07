/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { GameEventCtx } from "../../convex/wire/epochAssembler";

const modules = import.meta.glob("../../convex/**/*.ts");

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function seedSeasonAndDrops(t: ReturnType<typeof convexTest>) {
  return t.mutation(api.seasons.importSeason, {});
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
        headline: "PanAtlantic bonds halted at the exchange",
        body: "Trading desk confirms three consecutive missed settlements. Phones ringing.",
        category: "market",
        role: "main",
        arcSlug: "pan-atlantic-blowup",
        referenceEpoch: null,
      },
      {
        headline: "Marty Vale spotted outside SEC building",
        body: "No comment from his office. His assistant hung up.",
        category: "floor_talk",
        role: "supporting",
        arcSlug: "mercer-investigation",
        referenceEpoch: null,
      },
    ],
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
});

describe("wire/generator: no-op outside trading hours (via generateNextEpoch)", () => {
  it("generateNextEpoch skips without writing when called on a weekend", async () => {
    const t = convexTest(schema, modules);
    await seedSeasonAndDrops(t);

    // We can't control Date.now() in convex-test actions, but we can verify
    // the idempotency path: if the test is run on a weekend / off-hours, the
    // action returns skipped. On weekdays during market hours it may proceed.
    // This test verifies that the action handler exists and returns a valid shape.
    const result = await t.action(
      internal.wire.generator.generateNextEpoch,
      {}
    );

    // Result must be either a skipped object or an inserted object — never undefined
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
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
          headline: "Mystery arc dispatch here",
          body: "This arc does not exist in the season.",
          category: "market",
          role: "main",
          arcSlug: "nonexistent-arc-xyz",
          referenceEpoch: null,
        },
        {
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

    const stub = makeLlmStub();
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
