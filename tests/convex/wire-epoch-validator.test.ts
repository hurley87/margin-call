import { describe, it, expect } from "vitest";
import { normalizeGeneratedEpoch } from "../../convex/wire/epochNormalizer";
import { validateEpoch } from "../../convex/wire/epochValidator";

const arcSlugs = new Set(["arc-a", "arc-b"]);
const entitySlugs = new Set(["marty-vale", "sec-agent"]);
const forbiddenLanguage = ["DeFi", "wagmi", "stakeholders"];

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
        category: "market",
        role: "main" as const,
        arcSlug: "arc-a",
        referenceEpoch: null,
      },
      {
        dispatchKey: "supp-vale",
        headline: "Marty Vale exits the building",
        body: "Vale's coat is on. His assistant is shredding paper.",
        category: "floor_talk",
        role: "supporting" as const,
        arcSlug: "arc-b",
        referenceEpoch: null,
      },
    ],
    dealSeed: null,
    arcUpdates: [{ arcSlug: "arc-a", tensionDelta: 2 }],
    entityMentions: ["marty-vale"],
  };
}

function makeValidPayloadWithSeed() {
  const payload = makeValidPayload();
  payload.dispatches[1].role = "deal_seed" as never;
  (payload as Record<string, unknown>).dealSeed = {
    dispatchKey: "supp-vale",
    arcSlug: "arc-b",
    prompt:
      "Vale tip says PanAtlantic books are missing $40M from Jersey desk.",
    suggestedPotUsdc: 10,
    suggestedEntryCostUsdc: 5,
  };
  return payload;
}

describe("validateEpoch: accepts valid payloads", () => {
  it("accepts a valid 2-dispatch payload", () => {
    const result = validateEpoch(makeValidPayload(), {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a valid 3-dispatch payload", () => {
    const payload = makeValidPayload();
    payload.dispatches.push({
      dispatchKey: "supp-sec",
      headline: "SEC files subpoena",
      body: "Document request covers three years of trading records.",
      category: "regulatory",
      role: "supporting" as const,
      arcSlug: "arc-b",
      referenceEpoch: null,
    });
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a payload with null arcUpdates", () => {
    const payload = makeValidPayload();
    (payload as Record<string, unknown>).arcUpdates = null;
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a payload with a deal_seed dispatch role and matching dealSeed", () => {
    const result = validateEpoch(makeValidPayloadWithSeed(), {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(true);
  });
});

describe("validateEpoch: rejects invalid dispatch counts", () => {
  it("rejects a 1-dispatch payload", () => {
    const payload = makeValidPayload();
    payload.dispatches = [payload.dispatches[0]];
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a 4-dispatch payload", () => {
    const payload = makeValidPayload();
    for (let i = 2; i < 4; i++) {
      payload.dispatches.push({
        dispatchKey: `extra-${i}`,
        headline: `Extra dispatch ${i}`,
        body: "Extra body text here.",
        category: "market",
        role: "supporting" as const,
        arcSlug: null as unknown as string,
        referenceEpoch: null,
      });
    }
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a 2-dispatch payload with no 'main' role", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].role = "supporting" as never;
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/main/i);
  });
});

describe("validateEpoch: rejects unknown arcSlugs", () => {
  it("rejects unknown arcSlug in dispatch", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].arcSlug = "arc-unknown";
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain(
      "arc-unknown"
    );
  });

  it("rejects unknown arcSlug in arcUpdates", () => {
    const payload = makeValidPayload();
    payload.arcUpdates = [{ arcSlug: "arc-ghost", tensionDelta: 1 }];
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
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
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
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
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects body > 180 chars", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].body = "B".repeat(181);
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts headline of exactly 100 chars", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].headline = "A".repeat(100);
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts body of exactly 180 chars", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].body = "B".repeat(180);
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(true);
  });
});

describe("validateEpoch: rejects forbidden language", () => {
  it("rejects forbidden word in headline (case-insensitive)", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].headline = "DeFi plays are back on the floor";
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain("DeFi");
  });

  it("rejects forbidden word in body", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].body = "wagmi says the floor trader.";
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects forbidden word in dropTitle", () => {
    const payload = makeValidPayload();
    payload.dropTitle = "stakeholders meeting at noon";
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
  });

  it("catches forbidden language case-insensitively (uppercase)", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].headline = "WAGMI confirmed on the floor";
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
  });

  it("does not flag a forbidden word embedded inside another word", () => {
    const payload = makeValidPayload();
    payload.dispatches[0].body = "The trader shrugged and lit a cigarette.";
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage: ["rug"],
    });
    expect(result.ok).toBe(true);
  });
});

describe("validateEpoch: deal seed cadence + integrity", () => {
  it("rejects when requireDealSeed is true and dealSeed is null", () => {
    const result = validateEpoch(makeValidPayload(), {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
      requireDealSeed: true,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/cadence/i);
  });

  it("accepts when requireDealSeed is true and a valid dealSeed is supplied", () => {
    const result = validateEpoch(makeValidPayloadWithSeed(), {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
      requireDealSeed: true,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects dealSeed.arcSlug not in roster", () => {
    const payload = makeValidPayloadWithSeed();
    (payload.dealSeed as Record<string, unknown>).arcSlug = "arc-ghost";
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain(
      "arc-ghost"
    );
  });

  it("rejects dealSeed.dispatchKey not matching any dispatch", () => {
    const payload = makeValidPayloadWithSeed();
    (payload.dealSeed as Record<string, unknown>).dispatchKey = "no-match";
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(
      /must match exactly one dispatch/
    );
  });

  it("repairs a missing dealSeed dispatchKey when exactly one deal_seed dispatch exists", () => {
    const payload = makeValidPayloadWithSeed();
    (payload.dealSeed as Record<string, unknown>).dispatchKey =
      "panatl-short-squeeze";

    const normalized = normalizeGeneratedEpoch(payload);
    expect(normalized.repairedDealSeedDispatchKey).toEqual({
      from: "panatl-short-squeeze",
      to: "supp-vale",
    });

    const result = validateEpoch(normalized.epoch, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
      requireDealSeed: true,
    });
    expect(result.ok).toBe(true);
  });

  it("repairs a dealSeed dispatchKey that points at a non-deal_seed dispatch when exactly one deal_seed dispatch exists", () => {
    const payload = makeValidPayloadWithSeed();
    (payload.dealSeed as Record<string, unknown>).dispatchKey = "main-panatl";

    const normalized = normalizeGeneratedEpoch(payload);
    expect(normalized.repairedDealSeedDispatchKey).toEqual({
      from: "main-panatl",
      to: "supp-vale",
    });

    const result = validateEpoch(normalized.epoch, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
      requireDealSeed: true,
    });
    expect(result.ok).toBe(true);
  });

  it("does not repair a missing dealSeed dispatchKey without a deal_seed dispatch", () => {
    const payload = makeValidPayloadWithSeed();
    payload.dispatches[1].role = "supporting" as never;
    (payload.dealSeed as Record<string, unknown>).dispatchKey =
      "panatl-short-squeeze";

    const normalized = normalizeGeneratedEpoch(payload);
    expect(normalized.repairedDealSeedDispatchKey).toBeNull();

    const result = validateEpoch(normalized.epoch, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(
      /must match exactly one dispatch/
    );
  });

  it("does not repair a wrong-role dealSeed dispatchKey without a deal_seed dispatch", () => {
    const payload = makeValidPayloadWithSeed();
    payload.dispatches[1].role = "supporting" as never;
    (payload.dealSeed as Record<string, unknown>).dispatchKey = "main-panatl";

    const normalized = normalizeGeneratedEpoch(payload);
    expect(normalized.repairedDealSeedDispatchKey).toBeNull();

    const result = validateEpoch(normalized.epoch, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(
      /role "deal_seed"/
    );
  });

  it("does not repair a missing dealSeed dispatchKey with ambiguous deal_seed dispatches", () => {
    const payload = makeValidPayloadWithSeed();
    payload.dispatches.push({
      dispatchKey: "seed-second",
      headline: "Second seed on the wire",
      body: "Two playable rumors are competing for the same slot.",
      category: "rumor",
      role: "deal_seed" as const,
      arcSlug: "arc-a",
      referenceEpoch: null,
    });
    (payload.dealSeed as Record<string, unknown>).dispatchKey =
      "panatl-short-squeeze";

    const normalized = normalizeGeneratedEpoch(payload);
    expect(normalized.repairedDealSeedDispatchKey).toBeNull();

    const result = validateEpoch(normalized.epoch, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(
      /must match exactly one dispatch/
    );
  });

  it("repairs a missing dealSeed dispatchKey when the lone deal_seed dispatch has different arc metadata", () => {
    const payload = makeValidPayloadWithSeed();
    payload.dispatches[1].arcSlug = "arc-a";
    (payload.dealSeed as Record<string, unknown>).dispatchKey =
      "panatl-short-squeeze";

    const normalized = normalizeGeneratedEpoch(payload);
    expect(normalized.repairedDealSeedDispatchKey).toEqual({
      from: "panatl-short-squeeze",
      to: "supp-vale",
    });

    const result = validateEpoch(normalized.epoch, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects dealSeed pointing at a non-deal_seed dispatch", () => {
    const payload = makeValidPayloadWithSeed();
    // Point the seed at the main dispatch (which has role "main")
    (payload.dealSeed as Record<string, unknown>).dispatchKey = "main-panatl";
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(
      /role "deal_seed"/
    );
  });

  it("rejects duplicate dispatchKeys", () => {
    const payload = makeValidPayload();
    payload.dispatches[1].dispatchKey = payload.dispatches[0].dispatchKey;
    const result = validateEpoch(payload, {
      arcSlugs,
      entitySlugs,
      forbiddenLanguage,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(
      /duplicate dispatchkey/i
    );
  });
});
