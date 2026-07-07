import { describe, it, expect } from "vitest";
import {
  validateEpoch,
  BANNED_PHRASES,
  CRYPTO_TERMS,
} from "../../convex/wire/epochValidator";

const ctx = {
  arcSlugs: new Set(["co-kupo-1"]),
  entitySlugs: new Set(["kupo", "harness"]),
  forbiddenLanguage: ["defi"],
};

function makeEpoch(overrides: Record<string, unknown> = {}) {
  return {
    dropTitle: "Quiet tape",
    dispatches: [
      {
        dispatchKey: "kupo-quiet",
        headline: "Shares of Kupo drift on a slow session",
        body: "Kupo common barely moved and the floor barely noticed. The interns went to lunch. Nobody could be reached for comment.",
        role: "main",
        category: "wire",
        arcSlug: "co-kupo-1",
        referenceEpoch: null,
      },
    ],
    tweetVariant:
      "Kupo did approximately nothing today and the desk approves. $KUPO @kupo_gg",
    entityMentions: ["kupo"],
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
    expect(validateEpoch(epoch, ctx).ok).toBe(false);
  });

  it("rejects an unknown arcSlug", () => {
    const epoch = makeEpoch();
    epoch.dispatches[0].arcSlug = "ghost-arc";
    expect(validateEpoch(epoch, ctx).ok).toBe(false);
  });

  it("hard-blocks crypto vocabulary even in the tweet variant", () => {
    const epoch = makeEpoch({
      tweetVariant: "The token pumped today $KUPO @kupo_gg",
    });
    const res = validateEpoch(epoch, ctx);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Forbidden/);
  });

  it("blocks every hardcoded crypto term", () => {
    for (const term of CRYPTO_TERMS) {
      const epoch = makeEpoch();
      epoch.dispatches[0].body = `The desk mentioned ${term} once. Bad idea.`;
      expect(validateEpoch(epoch, ctx).ok).toBe(false);
    }
  });

  it("rejects season forbidden language", () => {
    const epoch = makeEpoch();
    epoch.dispatches[0].body = "Kupo pivots to defi, allegedly. The end.";
    expect(validateEpoch(epoch, ctx).ok).toBe(false);
  });

  it("rejects every banned filler phrase", () => {
    for (const phrase of BANNED_PHRASES) {
      const epoch = makeEpoch();
      epoch.dispatches[0].body = `The desk is quiet and ${phrase} now.`;
      expect(validateEpoch(epoch, ctx).ok).toBe(false);
    }
  });

  it("filters unknown entity mentions instead of failing the drop", () => {
    const res = validateEpoch(
      makeEpoch({ entityMentions: ["who-dis", "kupo"] }),
      ctx
    );
    expect(res.ok).toBe(true);
    if (res.ok && res.data) expect(res.data.entityMentions).toEqual(["kupo"]);
  });

  it("warns (does not block) on an untraceable percentage", () => {
    const epoch = makeEpoch();
    epoch.dispatches[0].body =
      "Kupo rocketed 99% for no reason at all. Wild day.";
    const res = validateEpoch(epoch, {
      ...ctx,
      allowedPercents: [3, 5],
    });
    expect(res.ok).toBe(true);
    expect(res.warnings).toContain("untraceable-percent:99");
  });

  it("warns on promotional coverage of the house company", () => {
    const epoch = makeEpoch();
    epoch.dispatches[0].body =
      "Harness is an unstoppable buy and a clear winner. Load up.";
    const res = validateEpoch(epoch, { ...ctx, subjectIsHouse: true });
    expect(res.ok).toBe(true);
    expect(res.warnings.some((w) => w.startsWith("house-promotional"))).toBe(
      true
    );
  });
});
