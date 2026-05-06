/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("seasons.importSeason", () => {
  it("seeds season, entities, arcs, and initial drop on first run", async () => {
    const t = convexTest(schema, modules);

    const result = await t.mutation(api.seasons.importSeason, {});

    expect(result.seasonId).toBeTruthy();
    expect(result.entitiesUpserted).toBeGreaterThan(0);
    expect(result.arcsUpserted).toBeGreaterThan(0);
    expect(result.dropInserted).toBe(true);
  });

  it("is idempotent — second run produces no new entities, arcs, or drops", async () => {
    const t = convexTest(schema, modules);

    const first = await t.mutation(api.seasons.importSeason, {});
    const second = await t.mutation(api.seasons.importSeason, {});

    expect(second.entitiesUpserted).toBe(0);
    expect(second.arcsUpserted).toBe(0);
    expect(second.dropInserted).toBe(false);
    expect(second.seasonId).toEqual(first.seasonId);
  });

  it("patches entity data without creating duplicates", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.seasons.importSeason, {});
    await t.mutation(api.seasons.importSeason, {});

    const entities = await t.query(internal.seasons.listEntitiesForTest, {});
    const slugs = entities.map((e: { slug: string }) => e.slug);
    const uniqueSlugs = new Set(slugs);
    expect(slugs.length).toEqual(uniqueSlugs.size);
  });
});
