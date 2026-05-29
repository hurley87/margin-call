import { describe, it, expect } from "vitest";
import { normalizeGeneratedEpoch } from "../../convex/wire/epochNormalizer";
import { validateEpoch } from "../../convex/wire/epochValidator";

const arcSlugs = new Set(["arc-a", "arc-b"]);
const entitySlugs = new Set(["marty-vale", "sec-agent"]);
const forbiddenLanguage = ["DeFi", "wagmi", "stakeholders"];

// Wire drops now emit exactly one role="main" dispatch and no Deal Seeds.
function makeValidPayload() {
  return {
    dropTitle: "MARGIN CALLED",
    worldState: {
      mood: "tense",
      sec_heat: 7,
      sectors: null,
      active_storylines: null,
      notable_traders: null,
    },
    dispatches: [
      {
        dispatchKey: "main-panatl",
        headline: "PanAtlantic down 12%",
        body: "The bond desk is silent. Nobody is picking up calls from Jersey.",
        category: "wire",
        role: "main" as const,
        arcSlug: "arc-a",
        referenceEpoch: null,
      },
    ],
    dealSeed: null,
    arcUpdates: [{ arcSlug: "arc-a", tensionDelta: 2 }],
    entityMentions: ["marty-vale"],
  };
}

function validateDefault(
  raw: unknown,
  overrides: Partial<Parameters<typeof validateEpoch>[1]> = {}
) {
  return validateEpoch(raw, {
    arcSlugs,
    entitySlugs,
    forbiddenLanguage,
    ...overrides,
  });
}

describe("validateEpoch: accepts valid payloads", () => {
  it("accepts a valid single-dispatch payload", () => {
    const result = validateDefault(makeValidPayload());
    expect(result.ok).toBe(true);
  });

  it("accepts a payload with null arcUpdates", () => {
    const payload = makeValidPayload();
    (payload as Record<string, unknown>).arcUpdates = null;
    const result = validateDefault(payload);
    expect(result.ok).toBe(true);
  });
});

describe("validateEpoch: rejects invalid dispatch counts", () => {
  it("rejects an empty dispatches array", () => {
    const payload = makeValidPayload();
    payload.dispatches = [];
    const result = validateDefault(payload);
    expect(result.ok).toBe(false);
  });

  it("rejects a 2-dispatch payload", () => {
    const payload = makeValidPayload();
    payload.dispatches.push({
      dispatchKey: "supp-vale",
      headline: "Marty Vale exits the building",
      body: "Vale's coat is on. His assistant is shredding paper.",
      category: "floor_talk",
      role: "supporting" as const,
      arcSlug: "arc-b",
      referenceEpoch: null,
    });
    const result = validateDefault(payload);
    expect(result.ok).toBe(false);
  });

  it("rejects a payload with no 'main' role", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].role = "supporting" as never;
    const result = validateDefault(payload);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/main/i);
  });
});

describe("validateEpoch: rejects unknown arcSlugs", () => {
  it("rejects unknown arcSlug in dispatch", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].arcSlug = "arc-unknown";
    const result = validateDefault(payload);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain(
      "arc-unknown"
    );
  });

  it("rejects unknown arcSlug in arcUpdates", () => {
    const payload = makeValidPayload();
    payload.arcUpdates = [{ arcSlug: "arc-ghost", tensionDelta: 1 }];
    const result = validateDefault(payload);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain(
      "arc-ghost"
    );
  });
});

describe("validateEpoch: rejects off-roster entity mentions", () => {
  it("rejects unknown entity slug", () => {
    const payload = makeValidPayload();
    payload.entityMentions = ["ghost-trader"];
    const result = validateDefault(payload);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain(
      "ghost-trader"
    );
  });
});

describe("validateEpoch: rejects too-long headlines and bodies", () => {
  it("rejects headline > 100 chars", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].headline = "A".repeat(101);
    const result = validateDefault(payload);
    expect(result.ok).toBe(false);
  });

  it("rejects body > 180 chars", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].body = "B".repeat(181);
    const result = validateDefault(payload);
    expect(result.ok).toBe(false);
  });

  it("accepts headline of exactly 100 chars", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].headline = "A".repeat(100);
    const result = validateDefault(payload);
    expect(result.ok).toBe(true);
  });

  it("accepts body of exactly 180 chars", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].body = "B".repeat(180);
    const result = validateDefault(payload);
    expect(result.ok).toBe(true);
  });
});

describe("validateEpoch: rejects forbidden language", () => {
  it("rejects forbidden word in headline (case-insensitive)", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].headline = "DeFi plays are back on the floor";
    const result = validateDefault(payload);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain("DeFi");
  });

  it("rejects forbidden word in body", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].body = "wagmi says the floor trader.";
    const result = validateDefault(payload);
    expect(result.ok).toBe(false);
  });

  it("rejects forbidden word in dropTitle", () => {
    const payload = makeValidPayload();
    payload.dropTitle = "stakeholders meeting at noon";
    const result = validateDefault(payload);
    expect(result.ok).toBe(false);
  });

  it("catches forbidden language case-insensitively (uppercase)", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].headline = "WAGMI confirmed on the floor";
    const result = validateDefault(payload);
    expect(result.ok).toBe(false);
  });

  it("does not flag a forbidden word embedded inside another word", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].body = "The trader shrugged and lit a cigarette.";
    const result = validateDefault(payload, { forbiddenLanguage: ["rug"] });
    expect(result.ok).toBe(true);
  });
});

describe("validateEpoch: rejects retired deal_seed artifacts", () => {
  it('rejects a dispatch with a "deal_seed" category', () => {
    const payload = makeValidPayload();
    payload.dispatches[0].category = "deal_seed";
    const result = validateDefault(payload);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/deal_seed/);
  });

  it("rejects a non-null dealSeed block", () => {
    const payload = makeValidPayload();
    (payload as Record<string, unknown>).dealSeed = {
      dispatchKey: "main-panatl",
      arcSlug: "arc-a",
      prompt: "A retired deal seed block that should be rejected outright.",
      suggestedPotUsdc: 10,
      suggestedEntryCostUsdc: 5,
    };
    const result = validateDefault(payload);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/dealSeed/);
  });
});

describe("validateEpoch: strict categories, phases, and materialChange", () => {
  it("rejects a max-tension primary dispatch without materialChange", () => {
    const result = validateDefault(makeValidPayload(), {
      topArcSlug: "arc-a",
      topArcTension: 10,
    });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(
      /requires materialChange/
    );
  });

  it("accepts a max-tension primary dispatch with concrete materialChange", () => {
    const payload = makeValidPayload();
    payload.dispatches[0] = {
      ...payload.dispatches[0],
      materialChange: {
        kind: "asset_loss",
        entitySlug: "marty-vale",
        magnitude: { unitsUsdc: 340_000_000 },
      },
    } as never;

    const result = validateDefault(payload, {
      topArcSlug: "arc-a",
      topArcTension: 10,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects a category outside the strict enum", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].category = "rumor-mill";

    const result = validateDefault(payload);

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/category/);
  });

  it("normalizes legacy market category before strict validation", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].category = "market";

    const normalized = normalizeGeneratedEpoch(
      payload as Parameters<typeof normalizeGeneratedEpoch>[0]
    );

    expect(normalized.repairedCategoryAliases).toBe(1);
    expect(normalized.epoch.dispatches[0].category).toBe("wire");
    expect(validateDefault(normalized.epoch).ok).toBe(true);
  });

  it("rejects materialChange with an off-roster entitySlug", () => {
    const payload = makeValidPayload();
    payload.dispatches[0] = {
      ...payload.dispatches[0],
      materialChange: {
        kind: "asset_loss",
        entitySlug: "unknown-bank",
      },
    } as never;

    const result = validateDefault(payload);

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain(
      "unknown-bank"
    );
  });

  it("rejects no role=main dispatch for a max-tension primary arc", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].arcSlug = "arc-b";

    const result = validateDefault(payload, {
      topArcSlug: "arc-a",
      topArcTension: 9,
    });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(
      /carried by a role=main dispatch/
    );
  });

  it("rejects an invalid arcUpdate phase", () => {
    const payload = makeValidPayload();
    payload.arcUpdates = [
      { arcSlug: "arc-a", tensionDelta: 1, phase: "boom" as never },
    ];

    const result = validateDefault(payload);

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/phase/);
  });

  it("accepts a valid arcUpdate phase", () => {
    const payload = makeValidPayload();
    payload.arcUpdates = [
      { arcSlug: "arc-a", tensionDelta: 1, phase: "panic" as never },
    ];

    const result = validateDefault(payload);

    expect(result.ok).toBe(true);
  });
});
