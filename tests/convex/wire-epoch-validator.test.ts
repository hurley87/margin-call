import { describe, it, expect } from "vitest";
import {
  validateEpoch,
  BANNED_PHRASES,
} from "../../convex/wire/epochValidator";

const ctx = {
  arcSlugs: new Set(["pan-atlantic-blowup"]),
  entitySlugs: new Set(["pan-atlantic-holdings", "marty-vale"]),
  forbiddenLanguage: ["DeFi", "wagmi"],
};

function makeEpoch(overrides: Record<string, unknown> = {}) {
  return {
    dropTitle: "The Wake",
    dispatches: [
      {
        dispatchKey: "panatl-wake",
        headline: "PanAtlantic is dead; nobody is sad",
        body: "Lenders would like their money back, in cash, today. The CEO is unavailable.",
        role: "main",
        category: "wire",
        arcSlug: "pan-atlantic-blowup",
        referenceEpoch: null,
      },
    ],
    entityMentions: ["pan-atlantic-holdings"],
    confirmedFacts: [],
    openQuestions: [],
    ...overrides,
  };
}

describe("validateEpoch", () => {
  it("accepts a clean drop", () => {
    const res = validateEpoch(makeEpoch(), ctx);
    expect(res.ok).toBe(true);
  });

  it("rejects when no dispatch has role main", () => {
    const epoch = makeEpoch({
      dispatches: [
        {
          dispatchKey: "k",
          headline: "h",
          body: "b",
          role: "supporting",
          category: "wire",
          arcSlug: null,
          referenceEpoch: null,
        },
      ],
    });
    const res = validateEpoch(epoch, ctx);
    expect(res.ok).toBe(false);
  });

  it("rejects an unknown arcSlug", () => {
    const epoch = makeEpoch();
    epoch.dispatches[0].arcSlug = "ghost-arc";
    const res = validateEpoch(epoch, ctx);
    expect(res.ok).toBe(false);
  });

  it("rejects forbidden language", () => {
    const epoch = makeEpoch();
    epoch.dispatches[0].body = "PanAtlantic pivots to DeFi, allegedly.";
    const res = validateEpoch(epoch, ctx);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Forbidden/);
  });

  it("rejects every banned filler phrase", () => {
    for (const phrase of BANNED_PHRASES) {
      const epoch = makeEpoch();
      epoch.dispatches[0].body = `The desk is quiet and ${phrase} now.`;
      const res = validateEpoch(epoch, ctx);
      expect(res.ok).toBe(false);
    }
  });

  it("filters unknown entity mentions instead of failing the drop", () => {
    const epoch = makeEpoch({
      entityMentions: ["who-dis", "marty-vale"],
    });
    const res = validateEpoch(epoch, ctx);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.entityMentions).toEqual(["marty-vale"]);
  });
});
