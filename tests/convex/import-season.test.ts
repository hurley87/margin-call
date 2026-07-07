/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { TOKEN_REGISTRY } from "../../convex/wire/tokenRegistry";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("seasons.importSeason", () => {
  it("seeds the season and syncs one company entity per registry token", async () => {
    const t = convexTest(schema, modules);
    const result = await t.mutation(api.seasons.importSeason, {});

    expect(result.seasonId).toBeTruthy();
    expect(result.companiesSynced).toBe(TOKEN_REGISTRY.length);

    const entities = await t.query(internal.seasons.listEntitiesForTest, {});
    expect(entities.length).toBe(TOKEN_REGISTRY.length);
    expect(entities.every((e: { kind: string }) => e.kind === "company")).toBe(
      true
    );
  });

  it("is idempotent — a second run creates no duplicate entities", async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(api.seasons.importSeason, {});
    const second = await t.mutation(api.seasons.importSeason, {});

    expect(second.seasonId).toEqual(first.seasonId);
    expect(second.companiesRemoved).toBe(0);

    const entities = await t.query(internal.seasons.listEntitiesForTest, {});
    const slugs = entities.map((e: { slug: string }) => e.slug);
    expect(slugs.length).toBe(new Set(slugs).size);
    expect(slugs.length).toBe(TOKEN_REGISTRY.length);
  });
});
